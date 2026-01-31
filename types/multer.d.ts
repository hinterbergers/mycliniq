import type { RequestHandler } from "express";

declare function multer(options?: multer.Options): multer.Multer;

declare namespace multer {
  interface Multer {
    single(fieldName: string): RequestHandler;
  }

  interface StorageEngine {}

  interface Options {
    storage?: StorageEngine;
    limits?: Record<string, unknown>;
  }

  function memoryStorage(): StorageEngine;
}

export default multer;
export = multer;
