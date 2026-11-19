# DiktoMed – uzstādīšanas instrukcija IT nodaļai

*Versija: 2026. gada novembris. Kas sistēma ir un kā tā aizsargā datus:
`IT-apraksts.md`.*

## Īsumā

- DiktoMed uzstāda **vienā** slimnīcas serverī. Darba datoros nekas nav
  jāinstalē: darbinieki sistēmu atver pārlūkā (Chrome, Edge, Firefox).
- Piegāde ir **viens arhīvs** (`diktomed-<versija>.tar`, ~5–8 GB). Tajā ir gatavi
  Docker attēli, runas atpazīšanas modelis un skripti. Serverim internets
  **nav vajadzīgs**, ne uzstādot, ne strādājot.
- Uzstādīšana aizņem apmēram 30 minūtes.

## 1. Kas jāsagatavo

| | Prasība |
|---|---|
| Serveris | Linux (ieteicams Ubuntu 22.04 vai 24.04), fizisks vai virtuāls |
| CPU / RAM | vismaz 8 kodoli / 16 GB, ieteicams 16 kodoli / 32 GB |
| Disks | vismaz 200 GB SSD, **šifrēts** (piem. LUKS) |
| GPU | nav obligāts. NVIDIA ar 8+ GB atmiņu paātrina atpazīšanu vairākas reizes |
| Programmatūra | Docker Engine 24+ ar Compose v2 (`docker compose version`) |
| Ar GPU | NVIDIA draiveris un NVIDIA Container Toolkit; pakotne `-gpu` |
| Tīkls | ienākošais 443 (HTTPS) no darba datoriem; 80 tikai pāradresācijai |
| DNS | iekšējais ieraksts, piem. `diktomed.slimnica.lv`, uz servera IP |
| Sertifikāts | šai adresei no slimnīcas sertifikātu centra: `cert.pem` (ar starpsertifikātiem) un `key.pem` |

## 2. Uzstādīšana

Iekopējiet arhīvu serverī un izpakojiet:

```bash
tar -xf diktomed-1.0.0.tar
cd diktomed-1.0.0
```

Ielieciet sertifikātu mapē `certs`:

```bash
cp /ceļš/uz/cert.pem /ceļš/uz/key.pem certs/
```

Palaidiet uzstādīšanu:

```bash
sudo ./install.sh
```

Skripts:

1. pārbauda Docker, pakotnes kontrolsummas un (GPU pakotnei) NVIDIA;
2. pajautā slimnīcas nosaukumu, pirmā administratora e-pastu un servera adresi;
3. iekopē sistēmu mapē `/opt/diktomed` (citu mapi var norādīt: `./install.sh /srv/diktomed`);
4. ielādē Docker attēlus, izveido `.env` ar nejaušām parolēm (tikai root var lasīt);
5. palaiž sistēmu un gaida, līdz tā atbild;
6. ieslēdz nakts rezerves kopijas (`/etc/cron.d/diktomed-backup`, 02:30);
7. parāda adresi un administratora **pagaidu paroli**.

Pagaidu paroli nododiet administratoram drošā veidā. Pirmajā pieslēgšanās reizē
sistēma liek to nomainīt. Pārējos darbiniekus administrators pievieno pats
sadaļā **Lietotāji**; katrs saņem savu pagaidu paroli.

Ja adresi atstāj tukšu, sistēma darbojas tikai pašā serverī
(`http://127.0.0.1:3000`). Tas der pārbaudei, bet ne darbam: bez HTTPS
pieslēgšanās no darba datoriem nav atļauta.

## 3. Pārbaude pēc uzstādīšanas

```bash
cd /opt/diktomed
docker compose ps
```

Jābūt palaistiem `db`, `web`, `worker` un `proxy`; `migrate` beidzas ar `Exited (0)`.

Atveriet darba datorā `https://diktomed.slimnica.lv`, pieslēdzieties kā
administrators, nomainiet paroli un augšupielādējiet testa ierakstu. Pēc
dažām minūtēm tam jāparādās ar statusu «Gaida pārbaudi».

## 4. Ikdienas darbs

Visas komandas izpilda mapē `/opt/diktomed`.

| Ko | Komanda |
|---|---|
| Stāvoklis | `docker compose ps` |
| Žurnāls | `docker compose logs --tail 100 web worker` |
| Apturēt | `docker compose stop` |
| Palaist | `docker compose up -d --no-build` |
| Restartēt | `docker compose restart` |

Pēc servera restarta sistēma palaižas pati (`restart: unless-stopped`).
Žurnālos ir tikai identifikatori un skaitļi, nav pacientu datu.

## 5. Rezerves kopijas

`backup.sh` saglabā datubāzi un audio failus, sistēmai darbojoties:

```
/opt/diktomed/backups/db-20261120-023000.dump
/opt/diktomed/backups/audio-20261120-023000.tar.gz
```

- Pēc noklusējuma glabā 14 dienas. Citu mapi un termiņu var norādīt
  `/etc/cron.d/diktomed-backup` rindā, piem.
  `BACKUP_DIR=/mnt/nas/diktomed BACKUP_KEEP_DAYS=30 /opt/diktomed/backup.sh`.
- **Kopijās ir pacientu dati.** Glabājiet tās tikai šifrētā krātuvē, vēlams
  ārpus šī servera (slimnīcas rezerves kopiju sistēmā).
- Ar roku: `sudo /opt/diktomed/backup.sh`.

Atjaunošana (aizstāj **visus** pašreizējos datus, prasa apstiprinājumu):

```bash
sudo /opt/diktomed/restore.sh backups/db-20261120-023000.dump backups/audio-20261120-023000.tar.gz
```

Ieteikums: pirms pilota vienreiz izmēģiniet atjaunošanu testa serverī.

Saglabājiet drošā vietā arī `/opt/diktomed/.env` un sertifikātus. Bez `.env`
sistēmu var uzstādīt no jauna un atjaunot datus no kopijas, bet visiem
lietotājiem būs jāpieslēdzas vēlreiz.

## 6. Atjauninājumi

Jauna versija pienāk kā jauns arhīvs. Ja modelis nav mainījies, tas ir mazāks,
dažas simtus MB.

```bash
tar -xf diktomed-1.1.0.tar
cd diktomed-1.1.0
sudo ./update.sh
```

Skripts vispirms izveido rezerves kopiju, tad ielādē jaunos attēlus un
restartē sistēmu. Dati, lietotāji un iestatījumi paliek. Datubāzes izmaiņas
tiek piemērotas automātiski un tikai **papildina** shēmu.

Atgriešanās pie iepriekšējās versijas: `/opt/diktomed/.env` iestatiet
`DIKTOMED_VERSION=<vecā versija>` un palaidiet `docker compose up -d --no-build`.

## 7. Iestatījumi (`/opt/diktomed/.env`)

Pēc izmaiņām: `docker compose up -d --no-build`.

| Iestatījums | Nozīme |
|---|---|
| `RETENTION_DAYS` | pēc cik dienām dzēst audio pēc apstiprināšanas (0 = nedzēst). Saskaņot ar datu aizsardzības speciālistu |
| `MAX_UPLOAD_MB` | lielākais augšupielādes fails (300) |
| `ASR_DEVICE` | `auto`, `cuda` vai `cpu` |
| `LLM_BASE_URL`, `LLM_MODEL` | pēc izvēles: lokāls valodas modelis slimnīcas tīklā protokola sagatavošanai |
| `DEMO_MODE` | vienmēr `false` |

Paroles un `SESSION_SECRET` nemainiet bez vajadzības: jauns `SESSION_SECRET`
izraksta visus lietotājus no sistēmas.

## 8. Drošība

- Tīklā ir atvērti tikai porti 443 un 80. Datubāze un atpazīšanas modulis
  nav pieejami no tīkla; atpazīšanas modulis (`worker`) ir Docker iekšējā tīklā
  **bez izejas uz internetu**.
- Sistēma nesūta datus ārpus servera, nav telemetrijas, nav ārēju fontu vai skriptu.
- Pieslēgšanās: pēc 5 nepareizām parolēm konts tiek bloķēts uz 15 minūtēm;
  sesija ilgst 12 stundas; izrakstoties visas lietotāja sesijas tiek atsauktas.
- Audita žurnāls (kas atvēra, laboja, apstiprināja, lejupielādēja) ir
  pieejams administratoram sadaļā **Audits**.
- Pirms darba ar reāliem pacientu datiem: datu aizsardzības ietekmes
  novērtējums (DPIA) un datu apstrādes līgums.

## 9. Problēmas

| Pazīme | Ko darīt |
|---|---|
| `install.sh`: «Pakotne ir bojāta» | arhīvs kopējot sabojājies; iekopējiet vēlreiz |
| Pārlūks brīdina par sertifikātu | `cert.pem` neatbilst adresei vai trūkst starpsertifikātu; pēc nomaiņas `docker compose restart proxy` |
| Ieraksts ilgi «Rindā» | `docker compose logs --tail 50 worker` |
| Lapa neatveras | `docker compose ps`, tad `docker compose logs --tail 50 web proxy` |

Saziņa ar izstrādātājiem: [vārds, e-pasts, tālrunis].
