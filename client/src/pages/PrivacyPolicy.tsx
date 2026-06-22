const sectionClassName = "space-y-3 rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F5BA7] via-[#1A67B8] to-[#0B4887] px-4 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="rounded-3xl bg-white/95 p-8 shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F5BA7]">
            MyCliniQ
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">Datenschutzerklaerung</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
            Diese Datenschutzerklaerung beschreibt die Verarbeitung personenbezogener Daten
            bei der Nutzung der Webanwendung und der iPhone-App von MyCliniQ.
          </p>
        </header>

        <section className={sectionClassName}>
          <h2 className="text-2xl font-semibold">1. Verantwortlicher</h2>
          <p className="text-sm leading-6 text-slate-700">
            Verantwortlich fuer die Datenverarbeitung im Rahmen von MyCliniQ ist der jeweilige
            organisatorische Betreiber der Anwendung innerhalb des klinischen Einsatzbereichs.
            Ansprechpartner fuer Rueckfragen sind die in der Einrichtung benannten
            Administrator:innen beziehungsweise die technische Projektverantwortung.
          </p>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-2xl font-semibold">2. Verarbeitete Daten</h2>
          <div className="space-y-2 text-sm leading-6 text-slate-700">
            <p>Je nach Berechtigung und Nutzung verarbeitet MyCliniQ insbesondere:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Stammdaten von Mitarbeiter:innen wie Name, Rolle, dienstliche Kontaktdaten</li>
              <li>Dienstplaene, Wochenplaene, Abwesenheiten und Verfuegbarkeiten</li>
              <li>Nachrichten, Benachrichtigungen und arbeitsbezogene Interaktionen</li>
              <li>SOP-Favoriten, Widget-Konfigurationen und persoenliche App-Einstellungen</li>
              <li>technische Protokolldaten zur Stabilitaet, Sicherheit und Fehleranalyse</li>
            </ul>
          </div>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-2xl font-semibold">3. Zweck der Verarbeitung</h2>
          <div className="space-y-2 text-sm leading-6 text-slate-700">
            <p>Die Verarbeitung erfolgt zur Bereitstellung der klinischen Arbeitsplattform, insbesondere fuer:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Darstellung und Organisation von Dienst- und Wochenplaenen</li>
              <li>Kommunikation innerhalb berechtigter Nutzergruppen</li>
              <li>Abbildung von SOPs, Tools, Widgets und klinischen Arbeitsablaeufen</li>
              <li>Verwaltung von Abwesenheiten, Einsatzdaten und Berechtigungen</li>
              <li>Sicherstellung von Betrieb, Support und IT-Sicherheit</li>
            </ul>
          </div>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-2xl font-semibold">4. Rechtsgrundlagen</h2>
          <p className="text-sm leading-6 text-slate-700">
            Die Verarbeitung erfolgt auf Grundlage der fuer den jeweiligen Betreiber anwendbaren
            datenschutzrechtlichen Vorschriften, insbesondere zur Erfuellung organisatorischer,
            arbeitsbezogener und sicherheitsrelevanter Aufgaben innerhalb des berechtigten
            Nutzerkreises.
          </p>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-2xl font-semibold">5. Speicherung und Sicherheit</h2>
          <div className="space-y-2 text-sm leading-6 text-slate-700">
            <p>
              Zugriff auf MyCliniQ erhalten ausschliesslich berechtigte Nutzer:innen. Die
              Anwendung verwendet technische und organisatorische Massnahmen zum Schutz vor
              unbefugtem Zugriff, Verlust und Manipulation. Daten werden nur so lange
              gespeichert, wie dies fuer Betrieb, Nachvollziehbarkeit, Support oder
              gesetzliche Pflichten erforderlich ist.
            </p>
            <p>
              Persoenliche Zugangsdaten duerfen nicht an Dritte weitergegeben werden. Jede
              Nutzerin und jeder Nutzer ist fuer die vertrauliche Verwahrung der eigenen
              Zugangsdaten verantwortlich. Bei missbraeuchlicher Weitergabe oder
              unzureichender Sicherung persoenlicher Zugangsdaten koennen Nutzer:innen im
              Rahmen der anwendbaren internen und gesetzlichen Vorschriften fuer daraus
              entstehende Schaeden oder Folgen verantwortlich gemacht werden.
            </p>
          </div>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-2xl font-semibold">6. Weitergabe von Daten</h2>
          <p className="text-sm leading-6 text-slate-700">
            Eine Weitergabe erfolgt nur im Rahmen des berechtigten klinischen Einsatzes, an
            eingebundene technische Dienstleister oder soweit dies rechtlich erforderlich ist.
            Eine Nutzung zu allgemeinen Werbezwecken findet nicht statt.
          </p>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-2xl font-semibold">7. Rechte betroffener Personen</h2>
          <p className="text-sm leading-6 text-slate-700">
            Betroffene Personen koennen im Rahmen der anwendbaren gesetzlichen Vorschriften
            Auskunft, Berichtigung, Einschraenkung oder Loeschung verlangen sowie weitere
            Datenschutzrechte geltend machen. Anfragen sind an die verantwortliche Einrichtung
            oder die dort benannte Datenschutzstelle zu richten.
          </p>
        </section>

        <section className={sectionClassName}>
          <h2 className="text-2xl font-semibold">8. Kontakt</h2>
          <div className="space-y-2 text-sm leading-6 text-slate-700">
            <p>
              Bei Fragen zum Datenschutz in MyCliniQ wenden Sie sich bitte an die
              zuständigen Administrator:innen oder an die innerhalb Ihrer Einrichtung
              benannte Datenschutz-Ansprechstelle.
            </p>
            <p>
              Technischer Ansprechpartner:{" "}
              <a
                href="mailto:stefan.hinterberger@kabeg.at"
                className="font-medium text-[#0F5BA7] hover:underline"
              >
                Dr. Stefan Hinterberger, stefan.hinterberger@kabeg.at
              </a>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
