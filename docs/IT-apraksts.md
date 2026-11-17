# DiktoMed – tehniskais apraksts slimnīcas IT nodaļai

*Melnraksts pilota saskaņošanai. Versija: 2026. gada novembris.*

## Ko sistēma dara

Diktofonu centra darbinieks augšupielādē ārsta diktātu (vai ārsts to ieraksta
pārlūkā). Sistēma slimnīcas serverī pārvērš runu tekstā, izceļ vietas, kas
jāpārbauda (neskaidri vārdi, skaitļi un devas, operācijas puse pret plānoto,
iespējamas halucinācijas), un darbinieks tās noklausās, izlabo un apstiprina.
No apstiprinātā teksta sistēma sagatavo protokolu pa sadaļām; katru lauku
pārbauda un apstiprina cilvēks. Rezultāts tiek lejupielādēts DOCX formātā.

## Arhitektūra

```
Darba datori (pārlūks)  --HTTPS-->  Slimnīcas serveris
                                    ├─ web     (Next.js, pieslēgšanās, saskarne)
                                    ├─ db      (PostgreSQL)
                                    ├─ worker  (runas atpazīšana, GPU)
                                    └─ [pēc izvēles] lokāls valodas modelis
```

- Viss darbojas **vienā slimnīcas serverī** Docker konteineros.
- **Nekas netiek sūtīts uz internetu**: ne audio, ne teksts. Runas atpazīšanas
  modelis (Whisper large-v3, latviešu valodai pielāgots LU MII) atrodas serverī.
- Worker konteiners ir iekšējā Docker tīklā **bez izejas uz internetu**.
- Lietotāji sistēmu atver pārlūkā, ievadot iekšējo adresi, piemēram
  `https://diktomed.<slimnīcas-domēns>.lv` (ieraksts slimnīcas iekšējā DNS).
  No interneta sistēma nav pieejama.

## Servera prasības (pilotam)

| | Minimums | Ieteicams |
|---|---|---|
| OS | Linux (Ubuntu 22.04/24.04) ar Docker | tas pats, var būt virtuālā mašīna ar GPU |
| CPU / RAM | 8 kodoli / 32 GB | 16 kodoli / 64 GB |
| GPU | NVIDIA ar 12 GB atmiņu | NVIDIA ar 24 GB (ja izmanto arī valodas modeli protokolam) |
| Disks | 250 GB SSD, šifrēts | 500 GB SSD, šifrēts |
| Tīkls | piekļuve no darba datoriem pa 443 | izejošs internets nav vajadzīgs |

Bez GPU sistēma darbojas arī uz CPU, bet atpazīšana ir vairākas reizes lēnāka.
Audio apjoms: aptuveni 1–5 MB uz diktāta minūti.

## Datu aizsardzība

- **Pārzinis ir slimnīca**, mēs esam programmatūras piegādātājs. Pilotam
  sagatavosim datu apstrādes līgumu un palīdzēsim ar ietekmes novērtējumu (DPIA).
- **Pieslēgšanās**: konti, ko izsniedz slimnīcas administrators; pagaidu parole
  pirmajā reizē jānomaina; sesija beidzas pēc 12 stundām. Plānots: pieslēgšanās
  ar slimnīcas Active Directory.
- **Audita žurnāls**: kas un kad atvēra, laboja, apstiprināja un lejupielādēja
  katru diktātu. Žurnālā netiek glabāts diktātu teksts.
- **Glabāšana**: audio pēc apstiprināšanas var automātiski dzēst pēc noteikta
  dienu skaita (saskaņā ar slimnīcas noteikumiem); apstiprinātais teksts paliek.
- **Lēmumus pieņem cilvēks**: sistēma tikai izceļ un iesaka, tā nekad pati
  nemaina tekstu. Dokumentu nevar apstiprināt, kamēr nav pārbaudītas augsta
  riska vietas.
- **Atjauninājumi** tiek piegādāti kā gatavs pakotnes fails; uzstādīšana
  saskaņotā laikā kopā ar IT nodaļu. Attālināta piekļuve tikai caur slimnīcas
  kontrolētu kanālu.

## Kas mums vajadzīgs no slimnīcas

1. Diktofonu modelis un ierakstu formāts (DSS, DS2, WAV, MP3), vai ieraksti ir šifrēti.
2. Pašreizējais ierakstu ceļš līdz diktofonu centram un glabāšanas vieta.
3. Apjoms: diktātu skaits dienā, vidējais ilgums, darbinieku skaits.
4. Serveris vai virtuālā mašīna ar GPU pilotam, Docker atļauja.
5. Iekšējais DNS ieraksts un HTTPS sertifikāts (slimnīcas sertifikātu centrs).
6. Active Directory pieslēgšanās iespēja (pēc pilota sākuma).
7. Datu aizsardzības speciālista kontakts DPIA saskaņošanai.
8. Dažas inscenētas vai anonimizētas testa ierakstu kopijas.

## Pilota plāns

1. Uzstādīšana slimnīcas serverī kopā ar IT nodaļu (viena darba diena).
2. 2–4 nedēļas darbs ar reāliem diktātiem diktofonu centrā.
3. Mērījumi: cik % melnraksta vārdu jālabo, cik laika aizņem viens diktāts
   salīdzinājumā ar pārrakstīšanu no nulles.
4. Lēmums par turpmāko darbu, balstoties uz šiem skaitļiem.
