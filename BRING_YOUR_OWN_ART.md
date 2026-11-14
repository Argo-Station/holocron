# Bring your own art

This copy of Project Holocron ships without the species portraits, the two symbol fonts, the dice sounds and
the galaxy map's planet coordinates. We can't give you those files. If you have your own, drop them in the
places below and the app picks them up. Nothing needs changing in the code.

Without them, everything still works: a species shows its initial, the dice show letters, the dice roll
silently, and the GM's galaxy map says it could not load.

## Species portraits

- **Where:** `public/SWDataSet-Master/species_portraits/`
- **Format:** WebP, 600 × 1000 pixels (portrait, 3:5).
- **Names:** one file per species, named as in the table below. A species with no file shows its initial.
- **Then run:** `python3 scripts/canonical/build_species_portrait_manifest.py`. This writes `manifest.json`
  beside the files, and the app only shows files the manifest lists. Run it again after adding or removing
  a file.

If your file is named after a species but isn't in the table, the script still matches it by the species'
name (spaces become `_`, apostrophes are dropped) or by its id.

| species id | species | file |
|---|---|---|
| `aleena` | Aleena | `Aleena.webp` |
| `anx` | Anx | `Anx.webp` |
| `aqualish` | Aqualish | `Aqualish.webp` |
| `arcona` | Arcona | `Arcona.webp` |
| `arkanian` | Arkanian | `Arkanian.webp` |
| `arkanian_offshoot` | Arkanian Offshoot | `Arkanian_Offshoot.webp` |
| `balosar` | Balosar | `Balosar.webp` |
| `barabel` | Barabel | `Barabel.webp` |
| `bardottan` | Bardottan | `Bardottan.webp` |
| `besalisk` | Besalisk | `Besalisk.webp` |
| `bith` | Bith | `Bith.webp` |
| `bothan` | Bothan | `Bothan.webp` |
| `caamasi` | Caamasi | `Caamasi.webp` |
| `cathar` | Cathar | `Cathar.webp` |
| `cerean` | Cerean | `Cerean.webp` |
| `chadra_fan` | Chadra-Fan | `Chadra-Fan.webp` |
| `chagrian` | Chagrian | `Chagrian.webp` |
| `chevin` | Chevin | `Chevin.webp` |
| `chiss` | Chiss | `Chiss.webp` |
| `clawdite` | Clawdite | `Clawdite.webp` |
| `clone` | Clone | `Clone.webp` |
| `corellian_human` | Corellian Human | `Corellian_Human.webp` |
| `cosian` | Cosian | `Cosian.webp` |
| `csg_aalagar` | Aalagar | `Aalagar.webp` |
| `csg_aaraa` | Aar’aa | `Aaraa.webp` |
| `csg_abednedo` | Abednedo | `Abednedo.webp` |
| `csg_abugartte` | Ab’Ugartte | `AbUgartte.webp` |
| `csg_abyssin` | Abyssin | `Abyssin.webp` |
| `csg_adarian` | Adarian | `Adarian.webp` |
| `csg_adnerem` | Adnerem | `Adnerem.webp` |
| `csg_advozse` | Advozse | `Advozse.webp` |
| `csg_aing_tii` | Aing-Tii | `Aing-Tii.webp` |
| `csg_akurian` | Akurian | `Akurian.webp` |
| `csg_aleena` | Aleena | `Aleena.webp` |
| `csg_amani` | Amani | `Amani.webp` |
| `csg_amaran` | Amaran | `Amaran.webp` |
| `csg_amorphiian_being` | Amorphiian Being | `Amorphiian_Being.webp` |
| `csg_annoo_dat_blue` | Annoo-dat Blue | `Annoo-dat_Blue.webp` |
| `csg_annoo_dat_prime` | Annoo-dat Prime | `Annoo-dat_Prime.webp` |
| `csg_anomid` | Anomid | `Anomid.webp` |
| `csg_anx` | Anx | `Anx.webp` |
| `csg_anzat` | Anzat | `Anzat.webp` |
| `csg_anzellan` | Anzellan | `Anzellan.webp` |
| `csg_aqualish` | Aqualish | `Aqualish.webp` |
| `csg_araquia` | Araquia | `Araquia.webp` |
| `csg_arcona` | Arcona | `Arcona.webp` |
| `csg_ardennian` | Ardennian | `Ardennian.webp` |
| `csg_arkanian` | Arkanian | `Arkanian.webp` |
| `csg_askajian` | Askajian | `Askajian.webp` |
| `csg_asogian` | Asogian | `Asogian.webp` |
| `csg_avogwi` | Avogwi | `Avogwi.webp` |
| `csg_ayrou` | Ayrou | `Ayrou.webp` |
| `csg_balinak` | Balinak | `Balinak.webp` |
| `csg_balosar` | Balosar | `Balosar.webp` |
| `csg_barabel` | Barabel | `Barabel.webp` |
| `csg_baragwin` | Baragwin | `Baragwin.webp` |
| `csg_bardottan` | Bardottan | `Bardottan.webp` |
| `csg_bartokk` | Bartokk | `Bartokk.webp` |
| `csg_berrite` | Berrite | `Berrite.webp` |
| `csg_besalisk` | Besalisk | `Besalisk.webp` |
| `csg_bilar` | Bilar | `Bilar.webp` |
| `csg_bimm` | Bimm | `Bimm.webp` |
| `csg_bith` | Bith | `Bith.webp` |
| `csg_bivall` | Bivall | `Bivall.webp` |
| `csg_blood_carver` | Blood Carver | `Blood_Carver.webp` |
| `csg_bosph` | Bosph | `Bosph.webp` |
| `csg_bothan` | Bothan | `Bothan.webp` |
| `csg_bovorian` | Bovorian | `Bovorian.webp` |
| `csg_brizzit` | Brizzit | `Brizzit.webp` |
| `csg_brknaa` | B’rknaa | `Brknaa.webp` |
| `csg_brubb` | Brubb | `Brubb.webp` |
| `csg_caamasi` | Caamasi | `Caamasi.webp` |
| `csg_caarite` | Caarite | `Caarite.webp` |
| `csg_calibop` | Calibop | `Calibop.webp` |
| `csg_carosite` | Carosite | `Carosite.webp` |
| `csg_cathar` | Cathar | `Cathar.webp` |
| `csg_celegian` | Celegian | `Celegian.webp` |
| `csg_cerean` | Cerean | `Cerean.webp` |
| `csg_chadra_fan` | Chadra-Fan | `Chadra-Fan.webp` |
| `csg_chagrian` | Chagrian | `Chagrian.webp` |
| `csg_chalactan` | Chalactan | `Chalactan.webp` |
| `csg_chandrilan_human` | Chandrilan Human | `Chandrilan_Human.webp` |
| `csg_charon` | Charon | `Charon.webp` |
| `csg_chawenhe` | Cha’wen’he | `Chawenhe.webp` |
| `csg_chev` | Chev | `Chev.webp` |
| `csg_chevin` | Chevin | `Chevin.webp` |
| `csg_chironian` | Chironian | `Chironian.webp` |
| `csg_chiss` | Chiss | `Chiss.webp` |
| `csg_chistori` | Chistori | `Chistori.webp` |
| `csg_clawdite` | Clawdite | `Clawdite.webp` |
| `csg_codru_ji` | Codru-Ji | `Codru-Ji.webp` |
| `csg_colicoid` | Colicoid | `Colicoid.webp` |
| `csg_columi` | Columi | `Columi.webp` |
| `csg_corellian_human` | Corellian Human | `Corellian_Human.webp` |
| `csg_cosian` | Cosian | `Cosian.webp` |
| `csg_coway` | Coway | `Coway.webp` |
| `csg_cragmoloid` | Cragmoloid | `Cragmoloid.webp` |
| `csg_daimlo` | Daimlo | `Daimlo.webp` |
| `csg_dantari` | Dantari | `Dantari.webp` |
| `csg_dashade` | Dashade | `Dashade.webp` |
| `csg_dathomirian` | Dathomirian | `Dathomirian.webp` |
| `csg_dathomirian_human` | Dathomirian Human | `Dathomirian_Human.webp` |
| `csg_defel` | Defel | `Defel.webp` |
| `csg_delphidian` | Delphidian | `Delphidian.webp` |
| `csg_devaronian` | Devaronian | `Devaronian.webp` |
| `csg_devlikk` | Devlikk | `Devlikk.webp` |
| `csg_diathim` | Diathim | `Diathim.webp` |
| `csg_dowutin` | Dowutin | `Dowutin.webp` |
| `csg_drabatan` | Drabatan | `Drabatan.webp` |
| `csg_draedan` | Draedan | `Draedan.webp` |
| `csg_draethos` | Draethos | `Draethos.webp` |
| `csg_drall` | Drall | `Drall.webp` |
| `csg_dressellian` | Dressellian | `Dressellian.webp` |
| `csg_droid` | Droid | `Droid.webp` |
| `csg_dug` | Dug | `Dug.webp` |
| `csg_duinuogwuin` | Duinuogwuin | `Duinuogwuin.webp` |
| `csg_duros` | Duros | `Duros.webp` |
| `csg_duuranh` | Duu’ranh | `Duuranh.webp` |
| `csg_ebranite` | Ebranite | `Ebranite.webp` |
| `csg_echani` | Echani | `Echani.webp` |
| `csg_eklaad` | Eklaad | `Eklaad.webp` |
| `csg_elom` | Elom | `Elom.webp` |
| `csg_elomin` | Elomin | `Elomin.webp` |
| `csg_emliy` | Em’liy | `Emliy.webp` |
| `csg_enso` | Enso | `Enso.webp` |
| `csg_equat` | Equat | `Equat.webp` |
| `csg_ergesh` | Ergesh | `Ergesh.webp` |
| `csg_erkit` | Er’Kit | `ErKit.webp` |
| `csg_esoomian_zexx` | Esoomian/Zexx | `Esoomian_Zexx.webp` |
| `csg_ewok` | Ewok | `Ewok.webp` |
| `csg_falleen` | Falleen | `Falleen.webp` |
| `csg_farghul` | Farghul | `Farghul.webp` |
| `csg_feeorin` | Feeorin | `Feeorin.webp` |
| `csg_fefze` | Fefze | `Fefze.webp` |
| `csg_felucian` | Felucian | `Felucian.webp` |
| `csg_fett_clone` | Fett Clone | `Fett_Clone.webp` |
| `csg_filordus` | Filordus | `Filordus.webp` |
| `csg_filvian` | Filvian | `Filvian.webp` |
| `csg_firrerreo` | Firrerreo | `Firrerreo.webp` |
| `csg_flakax` | Flakax | `Flakax.webp` |
| `csg_florn_lamproid` | Florn Lamproid | `Florn_Lamproid.webp` |
| `csg_fluggrian` | Fluggrian | `Fluggrian.webp` |
| `csg_fneeb` | Fneeb | `Fneeb.webp` |
| `csg_fosh` | Fosh | `Fosh.webp` |
| `csg_frenk` | Frenk | `Frenk.webp` |
| `csg_frozian` | Frozian | `Frozian.webp` |
| `csg_galidyn` | Galidyn | `Galidyn.webp` |
| `csg_gallaprixom` | Gallaprixom | `Gallaprixom.webp` |
| `csg_gamorrean` | Gamorrean | `Gamorrean.webp` |
| `csg_gand` | Gand | `Gand.webp` |
| `csg_gank` | Gank | `Gank.webp` |
| `csg_gendai` | Gen’Dai | `GenDai.webp` |
| `csg_geonosian` | Geonosian | `Geonosian.webp` |
| `csg_geranite` | Geranite | `Geranite.webp` |
| `csg_gigoran` | Gigoran | `Gigoran.webp` |
| `csg_givin` | Givin | `Givin.webp` |
| `csg_glymphid` | Glymphid | `Glymphid.webp` |
| `csg_gorax` | Gorax | `Gorax.webp` |
| `csg_gormak` | Gormak | `Gormak.webp` |
| `csg_gossam` | Gossam | `Gossam.webp` |
| `csg_gotal` | Gotal | `Gotal.webp` |
| `csg_gran` | Gran | `Gran.webp` |
| `csg_gree` | Gree | `Gree.webp` |
| `csg_gungan` | Gungan | `Gungan.webp` |
| `csg_gupin` | Gupin | `Gupin.webp` |
| `csg_hapan_human` | Hapan Human | `Hapan_Human.webp` |
| `csg_harch` | Harch | `Harch.webp` |
| `csg_hdrachi` | H’drachi | `Hdrachi.webp` |
| `csg_hepsalum_tash` | Hepsalum Tash | `Hepsalum_Tash.webp` |
| `csg_herglic` | Herglic | `Herglic.webp` |
| `csg_hiromi` | Hiromi | `Hiromi.webp` |
| `csg_hnemthe` | H’nemthe | `Hnemthe.webp` |
| `csg_hodin` | Ho’Din | `HoDin.webp` |
| `csg_hoojib` | Hoojib | `Hoojib.webp` |
| `csg_houk` | Houk | `Houk.webp` |
| `csg_hrakian` | Hrakian | `Hrakian.webp` |
| `csg_huhk_lahsbee` | Huhk/Lahsbee | `Huhk_Lahsbee.webp` |
| `csg_human` | Human | `Human.webp` |
| `csg_huralok` | Huralok | `Huralok.webp` |
| `csg_hutt` | Hutt | `Hutt.webp` |
| `csg_hyallp` | Hyallp | `Hyallp.webp` |
| `csg_iakaru` | Iakaru | `Iakaru.webp` |
| `csg_icehead` | Icehead | `Icehead.webp` |
| `csg_iktotchi` | Iktotchi | `Iktotchi.webp` |
| `csg_inleshat` | Inleshat | `Inleshat.webp` |
| `csg_iotran` | Iotran | `Iotran.webp` |
| `csg_ishi_tib` | Ishi Tib | `Ishi_Tib.webp` |
| `csg_ithorian` | Ithorian | `Ithorian.webp` |
| `csg_iyra` | Iyra | `Iyra.webp` |
| `csg_jawa` | Jawa | `Jawa.webp` |
| `csg_jenet` | Jenet | `Jenet.webp` |
| `csg_kaleesh` | Kaleesh | `Kaleesh.webp` |
| `csg_kalleran` | Kalleran | `Kalleran.webp` |
| `csg_kamarian` | Kamarian | `Kamarian.webp` |
| `csg_kaminoan` | Kaminoan | `Kaminoan.webp` |
| `csg_kari` | Kari | `Kari.webp` |
| `csg_karkarodon` | Karkarodon | `Karkarodon.webp` |
| `csg_kel_dor` | Kel Dor | `Kel_Dor.webp` |
| `csg_kentra` | Kentra | `Kentra.webp` |
| `csg_kerestian` | Kerestian | `Kerestian.webp` |
| `csg_kerkoiden` | Kerkoiden | `Kerkoiden.webp` |
| `csg_keshiri` | Keshiri | `Keshiri.webp` |
| `csg_khil` | Khil | `Khil.webp` |
| `csg_khommite` | Khommite | `Khommite.webp` |
| `csg_kianthar` | Kian’thar | `Kianthar.webp` |
| `csg_kiffar` | Kiffar | `Kiffar.webp` |
| `csg_killik` | Killik | `Killik.webp` |
| `csg_kilmaulsi` | Kilmaulsi | `Kilmaulsi.webp` |
| `csg_kitonak` | Kitonak | `Kitonak.webp` |
| `csg_klatooinian` | Klatooinian | `Klatooinian.webp` |
| `csg_klytonian` | Klytonian | `Klytonian.webp` |
| `csg_kobok` | Kobok | `Kobok.webp` |
| `csg_koorivar` | Koorivar | `Koorivar.webp` |
| `csg_korun_human` | Korun Human | `Korun_Human.webp` |
| `csg_kowakian` | Kowakian monkey-lizard | `Kowakian.webp` |
| `csg_krevaaki` | Krevaaki | `Krevaaki.webp` |
| `csg_krish` | Krish | `Krish.webp` |
| `csg_krytollak` | Krytollak | `Krytollak.webp` |
| `csg_kubaz` | Kubaz | `Kubaz.webp` |
| `csg_kulless` | Kulless | `Kulless.webp` |
| `csg_kushiban` | Kushiban | `Kushiban.webp` |
| `csg_kyuzo` | Kyuzo | `Kyuzo.webp` |
| `csg_laboi` | Laboi | `Laboi.webp` |
| `csg_lannik` | Lannik | `Lannik.webp` |
| `csg_lasat` | Lasat | `Lasat.webp` |
| `csg_leffingite` | Leffingite | `Leffingite.webp` |
| `csg_lepi` | Lepi | `Lepi.webp` |
| `csg_lorrdian_human` | Lorrdian Human | `Lorrdian_Human.webp` |
| `csg_lugubraa` | Lugubraa | `Lugubraa.webp` |
| `csg_lurmen` | Lurmen | `Lurmen.webp` |
| `csg_lutrillian` | Lutrillian | `Lutrillian.webp` |
| `csg_mantellian_savrip` | Mantellian Savrip | `Mantellian_Savrip.webp` |
| `csg_marasan` | Marasan | `Marasan.webp` |
| `csg_meerian` | Meerian | `Meerian.webp` |
| `csg_melitto` | Melitto | `Melitto.webp` |
| `csg_menahuun` | Menahuun | `Menahuun.webp` |
| `csg_mikkian` | Mikkian | `Mikkian.webp` |
| `csg_mimbanite` | Mimbanite | `Mimbanite.webp` |
| `csg_miraluka` | Miraluka | `Miraluka.webp` |
| `csg_mirialan` | Mirialan | `Mirialan.webp` |
| `csg_mon_calamari` | Mon Calamari | `Mon_Calamari.webp` |
| `csg_morseerian` | Morseerian | `Morseerian.webp` |
| `csg_mrlssi` | Mrlssi | `Mrlssi.webp` |
| `csg_mshinn` | M’shinn | `Mshinn.webp` |
| `csg_murachaun` | Murachaun | `Murachaun.webp` |
| `csg_mustafarian` | Mustafarian | `Mustafarian.webp` |
| `csg_muun` | Muun | `Muun.webp` |
| `csg_myke` | Myke | `Myke.webp` |
| `csg_myneyrsh` | Myneyrsh | `Myneyrsh.webp` |
| `csg_nagai` | Nagai | `Nagai.webp` |
| `csg_nautolan` | Nautolan | `Nautolan.webp` |
| `csg_nazren` | Nazren | `Nazren.webp` |
| `csg_nazzar` | Nazzar | `Nazzar.webp` |
| `csg_neimoidian` | Neimoidian | `Neimoidian.webp` |
| `csg_nelvaanian` | Nelvaanian | `Nelvaanian.webp` |
| `csg_neti` | Neti | `Neti.webp` |
| `csg_nikto` | Nikto | `Nikto.webp` |
| `csg_nimbanel` | Nimbanel | `Nimbanel.webp` |
| `csg_noehon` | Noehon | `Noehon.webp` |
| `csg_noghri` | Noghri | `Noghri.webp` |
| `csg_nosaurian` | Nosaurian | `Nosaurian.webp` |
| `csg_nuiwit` | Nuiwit | `Nuiwit.webp` |
| `csg_nuknog` | Nuknog | `Nuknog.webp` |
| `csg_oliar` | Oliar | `Oliar.webp` |
| `csg_omwati` | Omwati | `Omwati.webp` |
| `csg_ongree` | Ongree | `Ongree.webp` |
| `csg_opquis` | Opquis | `Opquis.webp` |
| `csg_orgon` | Orgon | `Orgon.webp` |
| `csg_ortolan` | Ortolan | `Ortolan.webp` |
| `csg_ossan` | Ossan | `Ossan.webp` |
| `csg_paaerduag` | Paaerduag | `Paaerduag.webp` |
| `csg_pacithhip` | Pacithhip | `Pacithhip.webp` |
| `csg_paigun` | Paigun | `Paigun.webp` |
| `csg_palowick` | Pa’lowick | `Palowick.webp` |
| `csg_pan_preneur` | Pan-preneur | `Pan-preneur.webp` |
| `csg_pantoran` | Pantoran | `Pantoran.webp` |
| `csg_parwan` | Parwan | `Parwan.webp` |
| `csg_patrolian` | Patrolian | `Patrolian.webp` |
| `csg_pauan` | Pau’an | `Pauan.webp` |
| `csg_phindian` | Phindian | `Phindian.webp` |
| `csg_pho_pheahian` | Pho Ph’eahian | `Pho_Pheahian.webp` |
| `csg_phuii` | Phuii | `Phuii.webp` |
| `csg_phydolon` | Phydolon | `Phydolon.webp` |
| `csg_polis_massan` | Polis Massan | `Polis_Massan.webp` |
| `csg_priapulin` | Priapulin | `Priapulin.webp` |
| `csg_psadan` | Psadan | `Psadan.webp` |
| `csg_pulra` | Pulra | `Pulra.webp` |
| `csg_pweck` | P’w’eck | `Pweck.webp` |
| `csg_pyke` | Pyke | `Pyke.webp` |
| `csg_qiraash` | Qiraash | `Qiraash.webp` |
| `csg_quaple` | Quaple | `Quaple.webp` |
| `csg_quarren` | Quarren | `Quarren.webp` |
| `csg_quermian` | Quermian | `Quermian.webp` |
| `csg_quockran` | Quockran | `Quockran.webp` |
| `csg_quorsav` | Quor’sav | `Quorsav.webp` |
| `csg_qwohog` | Qwohog | `Qwohog.webp` |
| `csg_rakata` | Rakata | `Rakata.webp` |
| `csg_ranat` | Ranat | `Ranat.webp` |
| `csg_ranth` | Ranth | `Ranth.webp` |
| `csg_rattataki` | Rattataki | `Rattataki.webp` |
| `csg_reigat` | Reigat | `Reigat.webp` |
| `csg_rellarin` | Rellarin | `Rellarin.webp` |
| `csg_revwien` | Revwien | `Revwien.webp` |
| `csg_ridar` | Ri’Dar | `RiDar.webp` |
| `csg_rishii` | Rishii | `Rishii.webp` |
| `csg_rodian` | Rodian | `Rodian.webp` |
| `csg_roonan` | Roonan | `Roonan.webp` |
| `csg_ruurian` | Ruurian | `Ruurian.webp` |
| `csg_rybet` | Rybet | `Rybet.webp` |
| `csg_ryn` | Ryn | `Ryn.webp` |
| `csg_saheelindeeli` | Saheelindeeli | `Saheelindeeli.webp` |
| `csg_sakiyan` | Sakiyan | `Sakiyan.webp` |
| `csg_sanyassan` | Sanyassan | `Sanyassan.webp` |
| `csg_sarkan` | Sarkan | `Sarkan.webp` |
| `csg_sarkhai` | Sarkhai | `Sarkhai.webp` |
| `csg_sathari` | Sathari | `Sathari.webp` |
| `csg_saurin` | Saurin | `Saurin.webp` |
| `csg_sauvax` | Sauvax | `Sauvax.webp` |
| `csg_sedrian` | Sedrian | `Sedrian.webp` |
| `csg_selkath` | Selkath | `Selkath.webp` |
| `csg_selonian` | Selonian | `Selonian.webp` |
| `csg_sephi` | Sephi | `Sephi.webp` |
| `csg_shard` | Shard | `Shard.webp` |
| `csg_shashay` | Shashay | `Shashay.webp` |
| `csg_shawda_ubb` | Shawda Ubb | `Shawda_Ubb.webp` |
| `csg_shiido` | Shi’ido | `Shiido.webp` |
| `csg_shistavanen` | Shistavanen | `Shistavanen.webp` |
| `csg_sic_six` | Sic-Six | `Sic-Six.webp` |
| `csg_siniteen` | Siniteen | `Siniteen.webp` |
| `csg_sith` | Sith | `Sith.webp` |
| `csg_skakoan` | Skakoan | `Skakoan.webp` |
| `csg_skrilling` | Skrilling | `Skrilling.webp` |
| `csg_skup` | Skup | `Skup.webp` |
| `csg_skytri` | S’kytri | `Skytri.webp` |
| `csg_sljee` | Sljee | `Sljee.webp` |
| `csg_sludir` | Sludir | `Sludir.webp` |
| `csg_sluissi` | Sluissi | `Sluissi.webp` |
| `csg_sneevel` | Sneevel | `Sneevel.webp` |
| `csg_snivvian` | Snivvian | `Snivvian.webp` |
| `csg_spiner` | Spiner | `Spiner.webp` |
| `csg_squalris` | Squalris | `Squalris.webp` |
| `csg_squib` | Squib | `Squib.webp` |
| `csg_srrorstok` | Srrors’tok | `Srrorstok.webp` |
| `csg_ssi_ruu` | Ssi-Ruu | `Ssi-Ruu.webp` |
| `csg_stenax` | Stenax | `Stenax.webp` |
| `csg_sullustan` | Sullustan | `Sullustan.webp` |
| `csg_sunesi` | Sunesi | `Sunesi.webp` |
| `csg_svivreni` | Svivreni | `Svivreni.webp` |
| `csg_swokes_swokes` | Swokes Swokes | `Swokes_Swokes.webp` |
| `csg_sy_myrthian` | Sy Myrthian | `Sy_Myrthian.webp` |
| `csg_talid` | Talid | `Talid.webp` |
| `csg_talz` | Talz | `Talz.webp` |
| `csg_tarasin` | Tarasin | `Tarasin.webp` |
| `csg_tarc` | Tarc | `Tarc.webp` |
| `csg_tarnab` | Tarnab | `Tarnab.webp` |
| `csg_tarong` | Tarong | `Tarong.webp` |
| `csg_tarro` | Tarro | `Tarro.webp` |
| `csg_taung` | Taung | `Taung.webp` |
| `csg_tchuukthai` | Tchuukthai | `Tchuukthai.webp` |
| `csg_temolak` | Temolak | `Temolak.webp` |
| `csg_terrelian_jango` | Terrelian Jango Jumper | `Terrelian_Jango.webp` |
| `csg_thakwaash` | Thakwaash | `Thakwaash.webp` |
| `csg_theelin` | Theelin | `Theelin.webp` |
| `csg_thisspiasian` | Thisspiasian | `Thisspiasian.webp` |
| `csg_tholothian` | Tholothian | `Tholothian.webp` |
| `csg_tintinna` | Tintinna | `Tintinna.webp` |
| `csg_tissshar` | Tiss’shar | `Tissshar.webp` |
| `csg_tlanda_til` | t’landa Til | `tlanda_Til.webp` |
| `csg_tognath` | Tognath | `Tognath.webp` |
| `csg_togorian` | Togorian | `Togorian.webp` |
| `csg_togruta` | Togruta | `Togruta.webp` |
| `csg_toong` | Toong | `Toong.webp` |
| `csg_toydarian` | Toydarian | `Toydarian.webp` |
| `csg_trandoshan` | Trandoshan | `Trandoshan.webp` |
| `csg_trianii` | Trianii | `Trianii.webp` |
| `csg_triffian` | Triffian | `Triffian.webp` |
| `csg_trodatome` | Trodatome | `Trodatome.webp` |
| `csg_troig` | Troig | `Troig.webp` |
| `csg_tsurr` | T’surr | `Tsurr.webp` |
| `csg_tunroth` | Tunroth | `Tunroth.webp` |
| `csg_tusken_raider` | Tusken Raider | `Tusken_Raider.webp` |
| `csg_twilek` | Twi’lek | `Twilek.webp` |
| `csg_tynnan` | Tynnan | `Tynnan.webp` |
| `csg_ubese` | Ubese | `Ubese.webp` |
| `csg_ugnaught` | Ugnaught | `Ugnaught.webp` |
| `csg_ugor` | Ugor | `Ugor.webp` |
| `csg_umbaran` | Umbaran | `Umbaran.webp` |
| `csg_utai` | Utai | `Utai.webp` |
| `csg_vaathkree` | Vaathkree | `Vaathkree.webp` |
| `csg_vagaari` | Vagaari | `Vagaari.webp` |
| `csg_veknoid` | Veknoid | `Veknoid.webp` |
| `csg_vernol` | Vernol | `Vernol.webp` |
| `csg_verpine` | Verpine | `Verpine.webp` |
| `csg_vimbexian` | Vimbexian | `Vimbexian.webp` |
| `csg_visk` | Visk | `Visk.webp` |
| `csg_vodran` | Vodran | `Vodran.webp` |
| `csg_vor` | Vor | `Vor.webp` |
| `csg_vorzydiak` | Vorzydiak | `Vorzydiak.webp` |
| `csg_voss` | Voss | `Voss.webp` |
| `csg_vratix` | Vratix | `Vratix.webp` |
| `csg_vulptereen` | Vulptereen | `Vulptereen.webp` |
| `csg_vurk` | Vurk | `Vurk.webp` |
| `csg_vuvrian` | Vuvrian | `Vuvrian.webp` |
| `csg_weequay` | Weequay | `Weequay.webp` |
| `csg_whaladon` | Whaladon | `Whaladon.webp` |
| `csg_whiphid` | Whiphid | `Whiphid.webp` |
| `csg_wol_cabasshite` | Wol Cabasshite | `Wol_Cabasshite.webp` |
| `csg_wookiee` | Wookiee | `Wookiee.webp` |
| `csg_woostoid` | Woostoid | `Woostoid.webp` |
| `csg_wroonian` | Wroonian | `Wroonian.webp` |
| `csg_xamster` | Xamster | `Xamster.webp` |
| `csg_xexto` | Xexto | `Xexto.webp` |
| `csg_xidec` | Xi’Dec | `XiDec.webp` |
| `csg_yaga` | Yaga | `Yaga.webp` |
| `csg_yaka` | Yaka | `Yaka.webp` |
| `csg_yamrii` | Yam’rii | `Yamrii.webp` |
| `csg_yarkora` | Yarkora | `Yarkora.webp` |
| `csg_yevetha` | Yevetha | `Yevetha.webp` |
| `csg_yinchorri` | Yinchorri | `Yinchorri.webp` |
| `csg_yodas_species` | Yoda’s Species | `Yodas_Species.webp` |
| `csg_ysannan_human` | Ysannan Human | `Ysannan_Human.webp` |
| `csg_yuuzhan_vong` | Yuuzhan Vong | `Yuuzhan_Vong.webp` |
| `csg_yuzzum` | Yuzzum | `Yuzzum.webp` |
| `csg_zabrak` | Zabrak | `Zabrak.webp` |
| `csg_zehethbra` | ZeHethbra | `ZeHethbra.webp` |
| `csg_zeison_sha` | Zeison Sha | `Zeison_Sha.webp` |
| `csg_zelosian` | Zelosian | `Zelosian.webp` |
| `csg_zeltron` | Zeltron | `Zeltron.webp` |
| `csg_zeuol` | Zeuol | `Zeuol.webp` |
| `csg_zygerrian` | Zygerrian | `Zygerrian.webp` |
| `dashade` | Dashade | `Dashade.webp` |
| `dathomirian` | Dathomirian | `Dathomirian.webp` |
| `defel` | Defel | `Defel.webp` |
| `devaronian` | Devaronian | `Devaronian.webp` |
| `dowutin` | Dowutin | `Dowutin.webp` |
| `drabatan` | Drabatan | `Drabatan.webp` |
| `drall` | Drall | `Drall.webp` |
| `dressellian` | Dressellian | `Dressellian.webp` |
| `droid` | Droid | `Droid.webp` |
| `dug` | Dug | `Dug.webp` |
| `duros` | Duros | `Duros.webp` |
| `elom` | Elom | `Elom.webp` |
| `elomin` | Elomin | `Elomin.webp` |
| `ewok` | Ewok | `Ewok.webp` |
| `ewok_aaa` | Ewok | `Ewok.webp` |
| `falleen` | Falleen | `Falleen.webp` |
| `farghul` | Farghul | `Farghul.webp` |
| `gamorrean` | Gamorrean | `Gamorrean.webp` |
| `gand` | Gand | `Gand.webp` |
| `gank` | Gank | `Gank.webp` |
| `geonosian` | Geonosian | `Geonosian.webp` |
| `gigoran` | Gigoran | `Gigoran.webp` |
| `givin` | Givin | `Givin.webp` |
| `gossam` | Gossam | `Gossam.webp` |
| `gotal` | Gotal | `Gotal.webp` |
| `gran` | Gran | `Gran.webp` |
| `gungan` | Gungan | `Gungan.webp` |
| `harch` | Harch | `Harch.webp` |
| `herglic` | Herglic | `Herglic.webp` |
| `human` | Human | `Human.webp` |
| `hutt` | Hutt | `Hutt.webp` |
| `iakaru` | Iakaru | `Iakaru.webp` |
| `iktotchi` | Iktotchi | `Iktotchi.webp` |
| `ishi_tib` | Ishi Tib | `Ishi_Tib.webp` |
| `ithorian` | Ithorian | `Ithorian.webp` |
| `jawa` | Jawa | `Jawa.webp` |
| `jawa_aaa` | Jawa | `Jawa.webp` |
| `kalleran` | Kalleran | `Kalleran.webp` |
| `kaminoan` | Kaminoan | `Kaminoan.webp` |
| `karkarodon` | Karkarodon | `Karkarodon.webp` |
| `kel_dor` | Kel Dor | `Kel_Dor.webp` |
| `klatooinian` | Klatooinian | `Klatooinian.webp` |
| `kubaz` | Kubaz | `Kubaz.webp` |
| `kyuzo` | Kyuzo | `Kyuzo.webp` |
| `lannik` | Lannik | `Lannik.webp` |
| `lasat` | Lasat | `Lasat.webp` |
| `lepi` | Lepi | `Lepi.webp` |
| `mandalorian_human` | Mandalorian Human | `Mandalorian_Human.webp` |
| `melitto` | Melitto | `Melitto.webp` |
| `mikkian` | Mikkian | `Mikkian.webp` |
| `mirialan` | Mirialan | `Mirialan.webp` |
| `mon_calamari` | Mon Calamari | `Mon_Calamari.webp` |
| `mustafarian` | Mustafarian | `Mustafarian.webp` |
| `muun` | Muun | `Muun.webp` |
| `nagai` | Nagai | `Nagai.webp` |
| `nautolan` | Nautolan | `Nautolan.webp` |
| `neimoidian` | Neimoidian | `Neimoidian.webp` |
| `nikto` | Nikto | `Nikto.webp` |
| `noghri` | Noghri | `Noghri.webp` |
| `ortolan` | Ortolan | `Ortolan.webp` |
| `pantoran` | Pantoran | `Pantoran.webp` |
| `pau_an` | Pau'an | `Pauan.webp` |
| `phydolon` | Phydolon | `Phydolon.webp` |
| `polis_massan` | Polis Massan | `Polis_Massan.webp` |
| `quarren` | Quarren | `Quarren.webp` |
| `quermian` | Quermian | `Quermian.webp` |
| `rodian` | Rodian | `Rodian.webp` |
| `ryn` | Ryn | `Ryn.webp` |
| `sakiyan` | Sakiyan | `Sakiyan.webp` |
| `sathari` | Sathari | `Sathari.webp` |
| `selkath` | Selkath | `Selkath.webp` |
| `selonian` | Selonian | `Selonian.webp` |
| `shistavanen` | Shistavanen | `Shistavanen.webp` |
| `skakoan` | Skakoan | `Skakoan.webp` |
| `sluissi` | Sluissi | `Sluissi.webp` |
| `snivvian` | Snivvian | `Snivvian.webp` |
| `squib` | Squib | `Squib.webp` |
| `sullustan` | Sullustan | `Sullustan.webp` |
| `talz` | Talz | `Talz.webp` |
| `thakwaash` | Thakwaash | `Thakwaash.webp` |
| `thisspiasian` | Thisspiasian | `Thisspiasian.webp` |
| `tholothian` | Tholothian | `Tholothian.webp` |
| `tognaths` | Tognaths | `Tognaths.webp` |
| `togorian` | Togorian | `Togorian.webp` |
| `togruta` | Togruta | `Togruta.webp` |
| `tor_dashade` | Dashade | `Dashade_TOR.webp` |
| `tor_echani` | Echani | `Echani.webp` |
| `tor_miraluka` | Miraluka | `Miraluka_TOR.webp` |
| `tor_rattataki` | Rattataki | `Rattataki_TOR.webp` |
| `tor_sith_pureblood` | Sith Pureblood | `Sith_Pureblood_TOR.webp` |
| `toydarians` | Toydarians | `Toydarians.webp` |
| `trandoshan` | Trandoshan | `Trandoshan.webp` |
| `tusken_raider` | Tusken Raider | `Tusken_Raider.webp` |
| `twi_lek` | Twi'lek | `Twilek.webp` |
| `ubese` | Ubese | `Ubese.webp` |
| `ugnaught` | Ugnaught | `Ugnaught.webp` |
| `umbaran` | Umbaran | `Umbaran.webp` |
| `verpine` | Verpine | `Verpine.webp` |
| `vurk` | Vurk | `Vurk.webp` |
| `weequay` | Weequay | `Weequay.webp` |
| `whiphid` | Whiphid | `Whiphid.webp` |
| `wookiee` | Wookiee | `Wookiee.webp` |
| `xexto` | Xexto | `Xexto.webp` |
| `zabrak` | Zabrak | `Zabrak.webp` |
| `zeltron` | Zeltron | `Zeltron.webp` |
| `zygerrian` | Zygerrian | `Zygerrian.webp` |

## Dice and result symbols (two fonts)

- **Where:** `public/fonts/`
- **Files:** `genesysglyphsanddice.woff2` and `genesysglyphsanddice.woff` (font family `Genesys`), plus
  `sw-rpg-icons.woff` (font family `SWRPGIcons`). The shells load them with `@font-face`.

The die shapes come from `Genesys`. Each shape is drawn in the die's own colour, so one character serves two
dice:

| die | character |
|---|---|
| Ability | `k` |
| Proficiency | `l` |
| Boost | `j` |
| Difficulty | `k` |
| Challenge | `l` |
| Setback | `j` |

The Force die and the results come from `SWRPGIcons`:

| symbol | code point |
|---|---|
| Force die | `U+E904` |
| Success | `U+E941` |
| Failure | `U+E93B` |
| Advantage | `U+E936` |
| Threat | `U+E943` |
| Triumph | `U+E945` |
| Despair | `U+E93A` |
| Light side, dark side, Force pip, Destiny Point | `U+E93E` |

## Dice sounds

- **Where:** `public/audio/dice/`
- **Format:** MP3.

| file | plays when |
|---|---|
| `roll-start.mp3` | a roll starts |
| `roll-settle.mp3` | the dice settle |
| `roll-settle-fail.mp3` | the dice settle on a failure |
| `triumph-burst.mp3` | a Triumph |
| `despair-suck.mp3` | a Despair |
| `invoke-destiny.mp3` | a Destiny Point is flipped |

## Galaxy map coordinates

- **Where:** `public/data/gdr_planets_mapped.json` and `public/data/gdr_routes_final.json`. The GM app fetches both.
- **Planets:** a JSON list, one object per planet:
  `{"name": "…", "x": 660.0, "y": -648.8, "region": "Outer Rim", "sector": "…", "grid_ref": "R-16",
  "planet_id": null}`. `planet_id` is the id of a planet record in `public/data/planets/` when one exists,
  otherwise `null`.
- **Routes:** a JSON list, one object per hyperspace lane:
  `{"name": "…", "lane_quality": "well_traveled", "astrogation_difficulty": "easy", "waypoints": ["…", "…"]}`.
  Each waypoint is a planet `name` from the planets file.
