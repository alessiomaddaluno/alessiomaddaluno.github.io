---
title: "247ctf Compare the Pair"
date: 2025-10-19T23:44:44+02:00
draft: false
---

# Compare The Pair - WEB

- **Platform:** 247ctf
- **Difficoltà:** Moderate (Relativo alla piattaforma)
- **Link:** https://247ctf.com/  

## Descrizione

```text
Can you identify a way to bypass our login logic? MD5 is supposed to be a one-way function right?
```

In questa CTF ci viene fornito un endpoint in cui viene mostrato il codice sorgente della pagina stessa. Il nostro obiettivo è bypassare la logica di login:

``` php
<?php
  require_once('flag.php');
  $password_hash = "0e902564435691274142490923013038";
  $salt = "f789bbc328a3d1a3";
  if(isset($_GET['password']) && md5($salt . $_GET['password']) == $password_hash){
    echo $flag;
  }
  echo highlight_file(__FILE__, true);
?>
```

## Analisi

Il codice è strutturalmente molto semplice: la flag si trova nel file 'flag.php' che viene mostrato solo e soltanto se viene soddisfatta questa condizione:

`if(isset($_GET['password']) && md5($salt . $_GET['password']) == $password_hash){`

Facendo un HTTP GET alla pagina e impostando il query param "password", viene calcolato l'hash del parametro e confrontato con quello hardcoded del codice.

L'hash viene calcolato tramite la funzione `md5($salt . $_GET['password'])`. Dal nome, sappiamo che l'algoritmo di hashing utilizzato è MD5 e che il salt è utilizzato concatenandolo alla password fornita come parametro. Per nostra fortuna, sia il salt che l'hash della password sono entrambi hardcoded nel codice sorgente.

Sarebbe semplice utilizzare hashcat per tentare un bruteforce o facendo utilizzo di un dizionario, tuttavia è un metodo poco interessante e soprattutto non abbiamo la certezza di riuscire a ricavare la password in questo modo. Possiamo fare di meglio.

### Il confronto in PHP

Guardando il codice attentamente c'è un particolare tanto subdolo quanto pericoloso: il modo in cui è fatto il confronto: quello che può essere un banale operatore di confronto (`==`) nasconde un'insidia che può trarre in inganno molto facilmente.
PHP ha due modi per verificare se due elementi sono uguali:

L'operatore "==": 

```php
$a = 5;   // Number
$b = "5"; // String
var_dump($a == $b); // true
```
che controlla se i valori sono uguali dopo la conversione di tipo (type juggling).

L'operatore "===": 
```php
$a = 5;
$b = "5";
var_dump($a === $b); // false
```
Decisamente più robusto, che controlla sia valore che il tipo di dato.

Nel nostro caso, il confronto che viene fatto è del primo tipo, quindi gli operandi sono soggetti al type juggling.

Il type juggling è la conversione automatica di un tipo di dato in un altro  quando necessario (ad esempio nel contesto di un confronto). Non è una caratteristica unica di PHP. Altri linguaggi hanno lo stesso meccanismo ed è particolarmente comodo soprattutto se si utilizza un linguaggio non tipizzato. Ma come possiamo sfruttarlo in questo caso?

Osserviamo attentamente l'hash della password hardcoded: `0e902564435691274142490923013038`

Come si può notare, è un hash particolare in quanto costituito esclusivamente da numeri ad esclusione della seconda cifra che contiene il carattere `e`. Questa stringa assomiglia alla rappresentazione scientifica di un numero, in particolare 0 x 10^(902564435691274142490923013038), ovvero 0.
Questo genere di stringhe in PHP viene definita "numeric string" e, nel momento in cui le vogliamo confrontare, PHP le converte in numero. Questo significa che, se riusciamo a produrre un hash che sembri una "numeric string" e quindi un numero in notazione scientifica, non stiamo più confrontando stringhe, ma numeri!

Per bypassare il login ci serve una password il cui hash (con salt) produca una stringa che inizi per 0e (cioè zero seguito dal carattere `e`) seguito solo numeri.

## Soluzione

Passiamo ora a scrivere uno script per poter trovare la password che ci serve. Non sarà la soluzione più efficiente possibile, ma fa il suo lavoro:

```python

import hashlib

salt = 'f789bbc328a3d1a3'
nonce = 1

print("Starting password cracking...")
while True:
    if nonce % 1000 == 0 and nonce != 0:
        print(f'Trying nonce: {nonce}')
    password = salt + str(nonce)
    hashed = hashlib.md5(password.encode()).hexdigest()
    if hashed[:2] == '0e' and hashed[2:].isdigit():
        print(f'Valid password found: {nonce}')
        print('Hash: ', hashed)
        break
    nonce += 1

```

Il suo funzionamento è molto semplice: attraverso una nonce che incrementiamo ad ogni iterazione, verifichiamo se il suo hash corrisponda al pattern che stiamo cercando. 

(Riflettendoci, concettualmente non è tanto diverso dal mining 🙂)

## Risultato

Dopo qualche minuto il nostro script (non particolarmente efficiente) ci mostra una password valida:

```bash
Trying nonce: 237694000
Trying nonce: 237695000
Trying nonce: 237696000
Trying nonce: 237697000
Trying nonce: 237698000
Trying nonce: 237699000
Trying nonce: 237700000
Trying nonce: 237701000
Valid password found: 237701818
Hash:  0e668271403484922599527929534016
```

È importante notare come questa non sia la password corretta, infatti l'hash è decisamente diverso da quello che abbiamo:

`md5('f789bbc328a3d1a3237701818') -> 0e668271403484922599527929534016 != 0e902564435691274142490923013038`

Tuttavia è una numeric string che causa questo comportamento:

```bash
php > echo '0e902564435691274142490923013038' == '0e668271403484922599527929534016';
1

# 0e902564435691274142490923013038 ovvero 0 x 10 ^ (902564435691274142490923013038) = 0
# 0e668271403484922599527929534016 ovvero 0 x 10 ^ (668271403484922599527929534016) = 0
# 0 == 0

```

Ovvero PHP le interpreta erroneamente come due numeri in notazione scientifica! Infatti qualunque stringa che segue il formato sarà true:

```bash
php > echo '0e902564435691274142490923013038' == '0e0';
1
php > echo '0e902564435691274142490923013038' == '0e123';
1
php > echo '0e902564435691274142490923013038' == '0e9999999999999';
1
```

Utilizzando la password trovata dal nostro script come query param (https://8e2e86060d2436d1.247ctf.com/?password=237701815) otteniamo il nostro premio:

![FLAG FOUND](/images/ctf/247ctf-compare-the-pair/flag_found.png)

## Approfondimenti

- [How PHP Type Juggling Works – Explained with Code Examples](https://www.freecodecamp.org/news/how-php-type-juggling-works-explained-with-code-examples/)
- [PHP Type Juggling Simplified](https://secops.group/php-type-juggling-simplified/)
- [Type Juggling](https://www.php.net/manual/en/language.types.type-juggling.php)