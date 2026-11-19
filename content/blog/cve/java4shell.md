---
title: "Un intrinsic senza un if: CVE-2026-114938 (Java4Shell)"
date: "2026-11-19T00:24:59+01:00"
tags: ["cybersecurity","cve","reverse engineering"]
description: "CVE-2026-114938: sulle CPU con AVX-512 VBMI l'intrinsic del decoder Base64 di OpenJDK sottrae il padding senza controllarlo."
images: ["/images/cve/java4shell/cover.png"]
---

![Lo pseudocodice dell'intrinsic Base64: remaining -= pad, senza il controllo che manca](/images/cve/java4shell/header.png)

Il **17 novembre 2026** Oracle, nella sua Critical Patch Update, rilascia la patch per una memory corruption in OpenJDK, nel decoder Base64. 
Alla CVE in questione (CVE-2026-114938) è associato un punteggio di **8.1** (CVSS 3.1) e viene battezzata **Java4Shell**. 


# Java e gli intrinsic

La vulnerabilità è interessante perché riguarda un **intrinsic**, in particolare uno specifico che si occupa del decode in base64.

Un intrinsic è un metodo Java che la JVM può sostituire con una sequenza di istruzioni macchina (assembly) durante la compilazione JIT.

Ad esempio:

```java
int result = Integer.bitCount(15);
```

Questo metodo normalmente avrebbe una sua implementazione Java. Tuttavia la JVM in certe circostanze (Ad esempio come la presenza di specifici flag CPU) può riconoscerlo e generare direttamente un istruzione hardware che il processore esegue direttamente, effettuando dunque una vera e propria ottimizzazione.

Questa vulnerabilità riguarda uno specifico intrinsic che si presenta solo su CPU con istruzioni AVX-512 VBMI.

Tali CPU dispongono di istruzioni che permettono di manipolare interi blocchi di byte in un colpo solo anziché uno alla volta. Sono esattamente le operazioni che servono per decodificare il Base64 in fretta, sfruttando l'hardware.

Il risultato è un decoder dalle prestazioni migliori. 


# Intrinsic in pseudocodice

Dal momento che analizzare un intrinsic è molto complesso (dal momento che è scritto in Assembly), per poter capire come funziona la vulnerabilità, possiamo analizzarlo attraverso il suo pseudocodice (Gentilmente offerto da Claudio) basato sul codice sorgente reale.

L'idea di base è una funzione, che chiameremo `decode` che prende in input:

- `src` il buffer che contiene il base 64;
- `srclen` che non è altro che la lunghezza di `src`;
- `dst` il buffer che conterrà i byte decodificati.


```java
decode(src, srclen, dst):
    // (1) dichiarazione
    remaining = (srclen / 4) * 3        //   quanti byte mi aspetto in output
    sp = src                            //   cursore di lettura (input)
    dp = dst                            //   cursore di scrittura (output)

    // (2) loop vettoriale: 64 caratteri -> 48 byte, finché c'è un blocco pieno
    while (srclen - (sp - src)) >= 64:
        v       = load_512(sp)
        decoded = vbmi_decode(v)        //     tradurre + ricompattare i bit
        store_512(dp, decoded)          //     scrive 48 byte pieni
        dp        += 48
        remaining -= 48
        sp        += 64

    // (3) la coda
    tail_len = srclen - (sp - src)
    tail     = vbmi_decode(load_tail(sp, tail_len))
    pad      = count_trailing_eq(sp, tail_len)   // quanti '=' in fondo

    // (4) correzione per il padding            
    remaining -= pad                    

    // (5) scrittura finale "mascherata"
    mask = (1 << remaining) - 1         
    store_masked(dp, tail, mask)
```

Ho aggiunto qualche commento, ma analizziamo ogni sezione con calma.

## // (1) dichiarazione

`sp` e `dp` sono due "puntatori": uno dice a che punto siamo nella lettura dell'input, l'altro a che punto siamo nella scrittura dell'output.
 
La riga interessante è la prima:
 
```java
remaining = (srclen / 4) * 3
```
 
`remaining` è il contatore di quanti byte dobbiamo ancora scrivere. Il numero esce dalla regola base del Base64: ogni **4 caratteri** in ingresso diventano **3 byte** in uscita (4 caratteri da 6 bit = 24 bit = 3 byte). Quindi da `srclen` caratteri ti aspetti `srclen/4 * 3` byte.
 
Attenzione però: questa è una **sovrastima**. Vale solo se tutti i gruppi sono "pieni". L'ultimo gruppo spesso non lo è, perché i dati originali non sempre sono un multiplo di 3 byte. In quel caso il Base64 riempie il buco con dei caratteri speciali, gli `=` ovvero il padding:
 
```
"XXXX"  -> 3 byte
"XXX="  -> 2 byte
"XX=="  -> 1 byte
```
 
In un Base64 valido gli `=` stanno solo in fondo e sono **al massimo due**. Questa regola è la chiave per capire dove sta il problema nel codice.

## // (2) loop vettoriale

Questo è il core dell'ottimizzazione. Finché restano almeno 64 caratteri da leggere, la funzione li prende a blocchi: `vbmi_decode` converte 64 caratteri in 48 byte tutti insieme, che vengono scritti con `store_512`. Poi aggiorna i contatori.
È qui che entra in gioco l'hardware: `vbmi_decode` usa quelle istruzioni AVX-512 VBMI di cui parlavamo, ed è il motivo per cui il bug esiste solo su certe CPU. In sostanza la funzione procede a blocchi finché trova almeno 64 caratteri; l'eventuale eccedenza va gestita dopo.

## // (3) la coda

Quello che avanza — da 0 a 63 caratteri è ciò che rimane in coda. La funzione lo decodifica e, soprattutto, fa una cosa semplice: conta quanti `=` ci sono in fondo.
 
```java
pad = count_trailing_eq(sp, tail_len)
```

La sovrastima del punto (1)? Ecco chi doveva sistemarla. `pad` è il numero di byte che avevamo contato per "sbaglio": erano solo padding, non dati veri, e quindi non vanno scritti.


## // (4) correzione per il padding

Una riga sola, che contiene tutta la vulnerabilità di questa CVE:

```java
remaining -= pad
```

L'intenzione è anche giusta, solo che non fa un controllo importantissimo: **non verifica se remaining >= pad**.

Su un input corretto, non c'è problema dato che abbiamo detto che avrà al massimo 2 `=`, quindi su 3 byte otteniamo 1. Il problema nasce con un input malformato, mettendo una coda fatta di soli `=` allora pad può superare remaining, e il contatore diventa negativo.

Perché è un problema?

## // (5) scrittura finale "mascherata"

Qui il numero negativo fa un bel disastro. Le ultime due righe usano remaining per decidere quanti byte scrivere davvero:

```java
mask = (1 << remaining) - 1
store_masked(dp, tail, mask)
```

La prima riga è il modo compatto per costruire una maschera di "quanti byte scrivere". Si posiziona l'1 facendo `remaining` shift verso sinistra, poi con il `-1` tutti i bit **al di sotto** di quella posizione diventano 1 (e la posizione dell'1 torna a 0). Con un esempio è tutto più chiaro:

```
remaining = 5
(1 << remaining ) = 100000 (1 seguito da remaining 0)
(1 << remaining ) - 1 = 100000 - 1 = 011111
```

Cinque bit a 1, cioè "scrivi 5 byte". Finché `remaining` è un numero piccolo e positivo, la maschera limita correttamente la scrittura.

Ma se `remaining` è diventato negativo (punto 4), qui succede il patatrac: il valore viene letto come numero **senza segno**, e un numero negativo letto così diventa enorme. Uno shift enorme riempie di 1 **l'intero registro**: la maschera non vale più "scrivi 5 byte", ma "scrivi tutto". 

Risultato: invece dei pochi byte legittimi, store_masked riversa un intero blocco oltre la fine del buffer di destinazione causando un overflow di circa 62 byte, per giunta pieni di contenuto che l'attaccante controlla (è il suo input decodificato). Da qui, nel caso migliore, l'applicazione crasha. Nel caso peggiore, quei byte piazzati nel punto giusto aprono la strada all'esecuzione di codice.

Tutto questo per non fare un if per andare a verificare che `remaining >= pad`.

## "Ma non dovrebbe lanciare un'eccezione?"

Questa è la domanda giusta, e me la sono fatta anch'io. Sì: il decoder Java **normale** su `====` lancia una bella `IllegalArgumentException` e non scrive niente. Il controllo c'è.
 
Il punto è dove gira il codice. L'eccezione la lancerebbe il codice Java. Ma a regime non è il codice Java a girare: è l'intrinsic in assembly. E l'intrinsic fa la sua scrittura vettoriale prima che qualunque controllo di alto livello possa intervenire. Quando (e se) l'eccezione arriva, la memoria oltre il buffer è già stata sovrascritta: motivo per cui una delle remediation è quella di disabilitare in totalmente l'intrinsic e lasciare che Java usi il decoder "normale", è più lento, ma non affetto dalla vulnerabilità:
 
```
-XX:-UseBASE64Intrinsics 
```

Per una POC completa c'è [questo repository](https://github.com/ikow/java4shell-poc).