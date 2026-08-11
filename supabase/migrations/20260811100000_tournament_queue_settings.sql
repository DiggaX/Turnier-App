-- Zwei Zahlen, aus denen "noch zwei Spiele vor dir" wird.
--
-- matches hat keine Uhrzeit und kein Feld — nur round und slot. Einen Zeitplan
-- nachzuruesten hiesse, auch einen Verschiebe-Mechanismus zu bauen: bei einem
-- Hallen- oder LAN-Turnier verrutscht die erste Partie, und ab da zeigt die App
-- den ganzen Tag falsche Uhrzeiten an. Das ist schlimmer als gar keine Angabe,
-- weil Leute danach planen.
--
-- Stattdessen eine Warteschlange. Der Spieler sieht, wieviele offene Partien vor
-- seiner liegen, und eine grobe Schaetzung daraus:
--
--   Wartezeit ~ ceil(Partien davor / parallel_stations) * match_duration_min
--
-- Beides ist bewusst eine Turniereinstellung und keine Messung: die Orga weiss
-- vor dem Turnier, wie lange eine Partie ungefaehr dauert und auf wievielen
-- Stationen gleichzeitig gespielt wird. Eine gemessene Laufzeit waere genauer,
-- braucht aber erst einmal gespielte Partien — und am unsichersten ist die
-- Schaetzung genau dann, wenn sie am meisten gebraucht wird: am Anfang.
--
-- Defaults so gewaehlt, dass Bestandsturniere ohne Zutun etwas Sinnvolles
-- zeigen. Nachgezaehlt an den 17 bereits gespielten Partien dieser Datenbank
-- (live_started_at bis live_ended_at): Median 11,2 Minuten, Spanne 0,7 bis 19,4.
-- Aufgerundet auf 12, damit die Schaetzung eher zu lang als zu kurz ausfaellt —
-- niemand aergert sich, frueher dranzukommen als angesagt, umgekehrt schon.
-- 1 Station ist die vorsichtige Annahme aus demselben Grund.

alter table tournaments
  add column if not exists match_duration_min int not null default 12,
  add column if not exists parallel_stations  int not null default 1;

alter table tournaments
  drop constraint if exists tournaments_match_duration_min_check;
alter table tournaments
  add constraint tournaments_match_duration_min_check
  check (match_duration_min between 1 and 480);

alter table tournaments
  drop constraint if exists tournaments_parallel_stations_check;
alter table tournaments
  add constraint tournaments_parallel_stations_check
  check (parallel_stations between 1 and 64);

comment on column tournaments.match_duration_min is
  'Angenommene Dauer einer Partie in Minuten. Speist die Wartezeit-Schaetzung auf "Mein Status" — keine Messung, eine Ansage der Orga.';

comment on column tournaments.parallel_stations is
  'Wieviele Partien gleichzeitig laufen. Teilt die Warteschlange: bei 2 Stationen sind vier Partien davor zwei Runden Wartezeit, nicht vier.';
