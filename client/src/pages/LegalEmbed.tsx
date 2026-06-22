import { Layout } from "@/components/layout/Layout";

type LegalEmbedProps = {
  src: string;
  title: string;
};

export function LegalEmbed({ src, title }: LegalEmbedProps) {
  return (
    <Layout title={title}>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <iframe
          src={src}
          title={title}
          className="h-[calc(100vh-16rem)] min-h-[720px] w-full"
        />
      </div>
    </Layout>
  );
}
