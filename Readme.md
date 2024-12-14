# Naslov diplome

Kompresija tekstur z BC1

## Opis

Cilj diplomskega dela je prikazati, kako deluje kompresija tekstur s pomočjo formata BC1 (znanega tudi kot DXT1). Format BC1 omogoča učinkovito kompresijo slikovnega materiala, pogosto uporabljenega v igrah in 3D grafiki, ter tako zmanjša porabo pomnilnika in pospeši prikazovanje. Diplomska naloga zajema tako konceptualni pregled algoritmov kot tudi praktično implementacijo v obliki dveh komponent:

1. **Spletna aplikacija (HTML/CSS/JS):**  
   V spletni aplikaciji lahko uporabnik naloži sliko, izvede kompresijo z različnimi metodami (PCA, Basic, Random, Cluster) ter si ogleda rezultate in osnovne statistike o kakovosti (MSE, PSNR, SSIM itd.).

2. **Ukazno-vrstični program (CMD, Deno + WebGPU):**  
   Ta program teče v okolju Deno in omogoča kompresijo ter dekompresijo DDS datotek preko ukazne vrstice. Vsebuje podporo za načine PCA, Basic, Random in Cluster, kakor tudi možnost nastavitve števila iteracij pri "random" metodi za natančnejše rezultate.

Tako spletna kot tudi CMD aplikacija ponujata različne pristope k BC1 kompresiji, kar omogoča primerjavo med enostavnimi (Basic), naprednimi (PCA, Cluster) in stohastičnimi (Random) metodami za doseganje najboljše kakovosti slike in učinkovitosti.

---

## Navodila

### Spletna aplikacija

#### Zagon spletne aplikacije

1. Odprite datoteko `index.html` v sodobnem brskalniku, ki podpira **WebGPU** (trenutno Chrome ali ustrezen brskalnik z vključenimi eksperimentalnimi funkcijami).

#### Nalaganje vhodne slike

- V uporabniškem vmesniku kliknite na **"Upload an Image"** ter izberite sliko (najbolje **PNG** ali **JPEG**). Originalna slika se bo prikazala v razdelku **"Original"**.

#### Nalaganje DDS datoteke (opcijsko)

- V polje **"Upload a DDS File"** lahko naložite DDS datoteko in tako preverite dekompresijo.

#### Nastavitev iteracij (za "Random" metodo)

- V polje **"Iterations"** vnesite število ponovitev pri naključni metodi kompresije (privzeto 10). Več iteracij lahko izboljša rezultat, a zahteva več računske moči.

#### Kompresija

- Kliknite **"Compress All"**. Spletna aplikacija bo izbrano sliko komprimirala z vsemi metodami (**PCA, Basic, Random, Cluster**). Po končani kompresiji bodo prikazane rekonstruirane slike ter statistike o kompresiji. Možen bo tudi prenos v DDS formatu.

---

### CMD aplikacija

#### POGOJI

- Nameščen Deno (zadnja stabilna različica)

#### Prenos in struktura kode

- Kodo prenesite ali sklonirajte iz repozitorija.

#### Uporaba

Odprite terminal v imeniku, kjer se nahaja cli/main.js.

Za kompresijo slike uporabite naslednji ukaz:

```bash
deno run --unstable --allow-read --allow-write cli/main.js compress vhodna_slika.png izhodna_slika.dds [metoda] [število_iteracij]
```

- vhodna_slika.png: pot do vhodne slike (format PNG ali JPEG).
- izhodna_slika.dds: ime in pot za shranjeno kompresirano DDS datoteko.
- metoda: izbirate lahko med naslednjimi metodami:

- pca (privzeta metoda)
- basic
- random
- cluster

- število_iteracij: (neobvezno) število iteracij, pomembno pri random metodi (privzeto: 10).

#### Primer

```bash
deno run --unstable --allow-read --allow-write cli/main.js compress moja_slika.png moja_slika.dds pca
```

#### Dekomresija DDS v PNG

```bash
deno run --unstable --allow-read --allow-write cli/main.js decompress moja_slika.dds izhodna_slika.png
```

- vhodna_slika.dds: pot do DDS datoteke
- izhodna_slika.png: ime in pot za rekonstruirano sliko v PNG formatu.

#### Rezultati

Po kompresiji bo v izhodna_slika.dds shranjena kompresirana tekstura v BC1 formatu.
Po dekompresiji bo v izhodna_slika.png shranjena rekonstruirana slika iz DDS formata.
