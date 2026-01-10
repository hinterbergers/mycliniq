declare module "html-to-docx" {
  const htmlToDocx: (html: string, options?: any) => Promise<Buffer> | Buffer;
  export default htmlToDocx;
}
