export default function Support() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F5BA7] via-[#1A67B8] to-[#0B4887] px-4 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="rounded-3xl bg-white/95 p-8 shadow-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0F5BA7]">
            MyCliniQ
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">Support</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            MyCliniQ ist eine interne klinische Arbeitsplattform. Diese Seite dient als
            zentrale Support-Anlaufstelle fuer Fragen zur iPhone-App, zur Webanwendung,
            zu Dienstplaenen, Widgets und zu klinischen Tools.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold">Hilfe bei Problemen</h2>
          <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
            <p>Bitte wenden Sie sich bei folgenden Themen an Ihr internes Support-Team:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Anmeldung oder fehlende Zugriffsrechte</li>
              <li>Fragen zu Dienstplaenen, Widgets oder Benachrichtigungen</li>
              <li>technische Stoerungen in Webanwendung oder iPhone-App</li>
              <li>Freischaltung von Benutzer:innen oder Rollen</li>
              <li>Rueckfragen zu medizinischen Rechnern und deren Quellenangaben</li>
            </ul>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold">Ansprechpartner</h2>
          <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
            <div>
              <p className="font-semibold text-slate-900">Dr. Stefan Hinterberger</p>
              <p>Projektverantwortung und Support fuer MyCliniQ</p>
            </div>
            <div className="space-y-1">
              <p>
                E-Mail:{" "}
                <a
                  href="mailto:stefan.hinterberger@kabeg.at"
                  className="font-medium text-[#0F5BA7] hover:underline"
                >
                  stefan.hinterberger@kabeg.at
                </a>
              </p>
              <p>
                Telefon:{" "}
                <a
                  href="tel:+4346353826413"
                  className="font-medium text-[#0F5BA7] hover:underline"
                >
                  +43 463 538 26413
                </a>
              </p>
            </div>
            <p>
              Bitte beschreiben Sie bei Support-Anfragen das betroffene Geraet, die
              Funktion und den Zeitpunkt des Problems moeglichst konkret.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold">Supportumfang</h2>
          <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
            <p>Unterstuetzt werden insbesondere:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Fragen zur Bedienung der App und der Webversion</li>
              <li>Fehlerberichte zu Widgets, Nachrichten, Dienstplaenen und Tools</li>
              <li>Rueckfragen zur Datenaktualisierung und zu Benutzerrechten</li>
              <li>allgemeine Rueckfragen fuer App-Review und interne Verteilung</li>
            </ul>
          </div>
        </section>

        <footer className="rounded-3xl border border-white/15 bg-white/10 px-6 py-4 text-sm text-white backdrop-blur-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-white/80">MyCliniQ Informationen</p>
            <div className="flex flex-wrap items-center gap-4">
              <a href="/support" className="font-medium text-white hover:underline">
                Support
              </a>
              <a href="/datenschutz" className="font-medium text-white hover:underline">
                Datenschutz
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
