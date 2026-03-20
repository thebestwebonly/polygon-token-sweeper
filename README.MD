# Polygon Token Sweeper – Many → One

Veřejná, open‑source webová aplikace pro bezpečný hromadný přesun ERC‑20 tokenů
z více adres na jednu cílovou adresu na síti Polygon.

## Co aplikace umí

- Načíst seznam zdrojových adres (jedna adresa na řádek)
- Načíst zůstatky zadaného ERC‑20 tokenu (např. BET) na síti Polygon
- Filtrovat peněženky podle minimálního zůstatku (X)
- Vypočítat částku k odeslání podle zvolené strategie:
  - Poslat vše
  - Poslat vše kromě Y
  - Poslat pevnou částku Y
  - Poslat procento zůstatku
  - Poslat nejméně Y
- Připravit plán odeslání (many → one)
- Postupně odesílat transakce přes Rabby / MetaMask
- Logovat výsledky a exportovat log do CSV

## Bezpečnost

- Aplikace nikdy nevyžaduje seed phrase ani privátní klíče.
- Veškerá logika běží pouze ve vašem prohlížeči (statický web).
- Podpisy transakcí provádí výhradně vaše peněženka (Rabby / MetaMask).
- Aplikace neodesílá žádná data na server.
- Zdrojový kód je veřejný a auditovatelný.

## Jak aplikaci používat

1. Otevřete stránku (GitHub Pages URL).
2. Připojte peněženku (Rabby / MetaMask).
3. Ujistěte se, že jste na síti Polygon.
4. Vložte seznam zdrojových adres (jedna adresa na řádek).
5. Zadejte cílovou adresu.
6. Zadejte adresu ERC‑20 tokenu (např. BET kontrakt na Polygonu).
7. Nastavte minimální zůstatek (X), ze kterého má smysl posílat.
8. Zvolte strategii odesílání (vše, vše kromě Y, pevná částka, procento, nejméně Y).
9. Klikněte na „Načíst zůstatky a připravit plán“.
10. Zkontrolujte tabulku (zůstatky, částky k odeslání).
11. Klikněte na „Zahájit odesílání“ a postupně potvrzujte transakce v peněžence.
12. Po dokončení můžete exportovat log do CSV.

## Omezení

- Aplikace předpokládá, že máte přístup ke všem zdrojovým adresám v jedné peněžence (např. Rabby).
- U každé transakce je nutné ruční potvrzení v peněžence.
- Aplikace neprovádí žádné automatické přepínání účtů, pokud to peněženka nepodporuje.

## Licence

Doporučeno: MIT nebo jiná permisivní licence.
