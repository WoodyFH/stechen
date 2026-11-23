/*
 * Einzige Stelle für die Versionsnummer.
 * Bei jeder Änderung an der App hochzählen: Der Service Worker legt daraus den
 * Cache-Namen "stechen-v<Nummer>" an, löscht alte Caches und übernimmt sofort.
 * Die Datei ist ein klassisches Skript (kein Modul), damit sie sowohl im
 * Service Worker (importScripts) als auch in der Seite geladen werden kann.
 */
globalThis.STECHEN_VERSION = 3;
