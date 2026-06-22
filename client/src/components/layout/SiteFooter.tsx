export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200/70 bg-white/90 px-6 py-4 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>MyCliniQ Informationen</p>
        <div className="flex flex-wrap items-center gap-4">
          <a href="/support" className="font-medium text-[#0F5BA7] hover:underline">
            Support
          </a>
          <a href="/datenschutz" className="font-medium text-[#0F5BA7] hover:underline">
            Datenschutz
          </a>
        </div>
      </div>
    </footer>
  );
}
