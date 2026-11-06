---
title: "Don’t be an *sshole: CVE-2026-123158"
date: "2026-11-06T17:15:18+01:00"
tags: ["cybersecurity","cve","reverse engineering"]
description: "CVE-2026-123158: su OpenSSH senza PAM con musl, una password più lunga di 256 caratteri basta per entrare negli account con password disabilitata. Due componenti corretti, incastrati male."
images: ["/images/cve/sshole/cover.png"]
---

![Login SSH come root con una password di 257 caratteri](/images/cve/sshole/header.png)

Il 5 novembre 2026, il team di OpenSSH ha rilasciato una patch di sicurezza (10.6p2) con quello che la release note definisce come "a critical security workaround". La vulnerabilità che sono andati a sistemare, classificata con CVE-2026-123158 (Individuata da Özgün Kültekin), consente ad un attaccante di autenticarsi via SSH su un account che non dovrebbe accettare nessuna password. Gli basta il nome dell'account.

La vulnerabilità (battezzata poi **\*sshole**) è interessante non tanto per il suo impatto (serio si, ma circoscritto) quanto per la sua "forma". Non c'è un pezzo di codice sbagliato, una use after free (come se ne sentono in questi giorni) o una race condition. Ci sono due componenti, entrambi che si comportano esattamente come i loro autori intendevano, il problema sta proprio nell'incastrarli tra di loro.

Poiché non è una vulnerabilità complessa da capire, secondo me vale la pena smontarla pezzo per pezzo, così nel mentre magari si impara qualcosa in più.


# Contesto

Sui sistemi Linux "normali"(Debian, Ubuntu, RHEL) l'autenticazione passa quasi sempre per **PAM**, uno strato che astrae la verifica delle credenziali. Senza un sistema centralizzato, ogni programma (in questo caso quelli come `login`, `sudo`, `su` ,`sshd` etc...) dovrebbe implementare autonomamente la gestione delle password e dei permessi: non è un problema banale ed è estremamente delicato.

Nel caso di OpenSSH può essere compilato senza il supporto a PAM. In questo caso, gestisce direttamente l'autenticazione tramite la propria implementazione, senza delegare a PAM la verifica delle credenziali. Ma perché scegliere di compilarlo senza PAM? Il motivo è principalmente legato alla necessità di realizzare sistemi più leggeri, soprattutto in certi contesti: container minimali, immagini cloud, dispositivi embedded etc. È la configurazione di default su **Alpine Linux** e, più in generale, sui sistemi basati su **musl libc**, ovvero un'implementazione della libc alternativa a `glibc`.

In questa modalità, `sshd` fa una cosa concettualmente semplice: prende la password che l'utente ha digitato, la passa alla funzione di libreria `crypt()`, e confronta l'hash risultante con il campo password memorizzato in `/etc/shadow`.

```c
/* pseudocodice della logica, non il sorgente reale di sshd */
char *hash = crypt(password_inviata, salt);
if (strcmp(hash, campo_shadow) == 0)
    autenticazione_ok();
```

C’è un tipo di account che sarà il centro del problema: quelli che nel campo password di /etc/shadow non hanno un hash, ma un singolo carattere sentinella, *. Sono account con autenticazione tramite password disabilitata e il caso tipico è root sulle immagini cloud di Alpine, dove si entra solo via chiave pubblica. 

Inoltre c'è un dettaglio implementativo di OpenSSH che vale la pena di anticipare. Quando sshd deve verificare una password, utilizza il valore presente in /etc/shadow come riferimento per la chiamata a crypt(). Questo valore contiene normalmente sia l'algoritmo utilizzato sia il salt necessario per calcolare l'hash.
Però in questo caso stiamo dicendo che contiene solo il valore `*`, cosa succede? Non essendoci un hash valido da cui ricavare il salt, OpenSSH deve recuperare un riferimento alternativo. In determinate condizioni utilizza quindi il salt di un altro account locale che possiede un hash valido.
Questo dettaglio è importante perché permette di arrivare comunque alla chiamata di crypt() anche quando l'account bersaglio ha la password disabilitata. Ed è proprio qui che si crea la condizione necessaria per la vulnerabilità.

## La protezione DoS di musl

Passiamo a `crypt()`. quella che sshd ha appena chiamato per trasformare la password in un hash. Ogni libc ha la sua implementazione, e quella di musl per gli hash di tipo `$6$`(cioè SHA-512) vive in un unico file, [src/crypt/crypt_sha512.c (Qui il sorgente)](https://git.musl-libc.org/cgit/musl/tree/src/crypt/crypt_sha512.c). 

Ora potrei stupirvi con le mie *non* esistenti doti da programmatore, oppure dare in pasto ad un LLM questo file e cacciare fuori dal cilindro un'analisi approfondita... ma in realtà se si leggono semplicemente i commenti troviamo:

```c
/*
 * public domain sha512 crypt implementation
 * ...
 * key length is limited, the $6$ prefix is mandatory, '\n' and ':' is rejected
 * in the salt ... on error "*" is returned.
 */
```

Il limite è una costante:

```c
#define KEY_MAX 256
```

E questo è il controllo vero e proprio, dentro la funzione `sha512crypt`:

```c
/* reject large keys */
for (i = 0; i <= KEY_MAX && key[i]; i++);
if (i > KEY_MAX)
    return 0;
klen = i;
```

Ma perché a questi fanno schifo le chiavi maggiori di 256 byte? Il motivo è che `sha512crypt` è deliberatamente lenta. Calcolare lo SHA-512 di una stringa non è tanto complesso è un'operazione relativamente veloce e questo non è positivo se un attaccante sta cercando di indovinare una password con bruteforce. Per questo lo schema `$6$` ripete l’hash migliaia di volte (5000), in modo da rendere ogni verifica costosa.  Questo rallentamento è documentato nel codice in questo punto:

```c
/* iterate A = f(A,DP,DS), this step takes O(rounds*klen) time */
for (i = 0; i < r; i++) {   /* r = 5000 */
    ...
}
```

Fin qui no problem: questo fa solo crescere linearmente il costo con la lunghezza della password, quindi una password lunga il doppio ci mette grosso modo il doppio.

Il problema è un altro pezzo dell'algoritmo, un passo che musl stessa commenta in modo inequivocabile:

```c
/* DP = sha(repeat-key), this step takes O(klen^2) time */
for (i = 0; i < klen; i++)
    sha512_update(&ctx, key, klen);
```

`klen` è la lunghezza della password. Il ciclo gira `klen` volte, e a ogni giro ridà in pasto all’hash tutta la password. Stiamo parlando dunque di una complessità dell'ordine di O(n^2), quadratica, quindi se raddoppi la lunghezza della chiave, quadruplichi il tempo di computazione. Il problema sta nel fatto che questa computazione la compie esclusivamente il server per verificare la password, prima di qualunque login.
Quindi aprendo molte connessioni in parallelo, ognuna con una password mostruosamente lunga, un attaccante può saturare la CPU abbastanza facilmente, causando un DOS. Da qui il motivo del limite a 256. Immagino che sia stato scelto questo perché è il giusto compromesso tra tempo di computazione e lunghezza ragionevole.

Quindi, cosa succede se inseriamo una password più lunga di 256 caratteri? La funzione ritorna 0.

Quel `return 0` risale fino alla funzione pubblica `__crypt_sha512`, il wrapper che `crypt()` invoca per i salt `$6$`:

```c
char *__crypt_sha512(const char *key, const char *setting, char *output)
{
	/* ... vettori di test hardcoded ... */
	char *p, *q;

	p = sha512crypt(key, setting, output);
	/* self test and stack cleanup */
	q = sha512crypt(testkey, testsetting, testbuf);
	if (!p || q != testbuf || memcmp(testbuf, testhash, sizeof testhash))
		return "*";
	return p;
}
```

Quando `sha512crypt` restituisce `0`, la condizione `!p` basta da sola a far ritornare la stringa `"*"`, non un codice d'errore, letteralmente il carattere `*`.
Fin qui, tutto corretto. musl ha rifiutato un input anomalo e lo ha segnalato nel modo previsto.

## Il problema

Cerchiamo di unire insieme i pezzi, per capire il tutto.Un account senza password ha `*` nel file shadow.
Un attaccante tenta il login su quell'account inviando una password  più lunga di 256 caratteri.

1. `sshd` (senza PAM) deve verificare;
2. Chiama `crypt(password_dell_attaccante_molto_lunga, salt_preso_in_prestito)`.
3. musl vede una chiave sopra `KEY_MAX`, entra in gioco la protezione DOS e restituisce `"*"`.
4. `sshd` confronta il valore restituito da `crypt()` con il campo shadow. Il campo shadow è `"*"`. Il ritorno di `crypt()` è `"*"`.

**Mellon!** come direbbe qualcuno, il confronto ha successo e quindi il login va a buon fine.

Per vederlo praticamente è presente questa [POC](https://github.com/oz9un/sshole/tree/main) creata da Özgün Kültekin , la persona che ha individuato la vulnerabilità utilizzando un container Docker basato su `alpine:3.24`

# In che contesto funziona?

Ricapitolando, questa funziona in uno specifico contesto:

- `sshd` compilato senza PAM  **e** linkato a musl;
- almeno un account con autenticazione tramite password disabilitata;
- almeno un account locale con un hash vero `$5$`/`$6$`, da cui prendere in prestito il salt.

Tipicamente su un Alpine, l'account bersaglio è proprio `root`.


## Chi ha introdotto la vulnerabilità? OpenSSH o musl ?

Forse OpenSSH. Anche se a dirla tutta non c'è un vero e proprio "bug", il tutto vive nell'assunzione implicita che `sshd` fa con l'uso di `crypt()`. Tuttavia comprendo anche OpenSSH: tecnicamente questo è un comportamento introdotto da musl, non di certo "standard" (Lo standard POSIX dice che crypt(), in caso di errore, deve restituire NULL). 

