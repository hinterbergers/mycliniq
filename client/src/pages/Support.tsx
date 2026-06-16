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
            MyCliniQ ist eine interne klinische Arbeitsplattform. Support und Freischaltungen
            erfolgen ueber die zustaendigen Administrator:innen innerhalb der Organisation.
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
            </ul>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold">Kontaktweg</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Der Support erfolgt ueber die in Ihrer Einrichtung benannten Administrator:innen,
            das Sekretariat oder die interne Projektverantwortung fuer MyCliniQ.
          </p>
        </section>
      </div>
    </div>
  );
}
