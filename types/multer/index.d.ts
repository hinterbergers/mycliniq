import type { Request, Response, NextFunction } from "express";

declare namespace Express {
  namespace Multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      buffer: Buffer;
      size: number;
      destination?: string;
      filename?: string;
      path?: string;
    }
  }

  interface Request {
    file?: Multer.File;
    files?: Multer.File | Multer.File[] | Record<string, Multer.File>;
  }
}

declare module "multer" {
  type StorageEngine = {
    _handleFile?: (
      req: Request,
      file: Express.Multer.File,
      callback: (error?: Error | null, info?: Partial<Express.Multer.File>) => void,
    ) => void;
    _removeFile?: (
      req: Request,
      file: Express.Multer.File,
      callback: (error?: Error | null) => void,
    ) => void;
  };

  interface MulterOptions {
    storage?: StorageEngine;
    limits?: Record<string, unknown>;
    fileFilter?: (
      req: Request,
      file: Express.Multer.File,
      callback: (error: Error | null, acceptFile?: boolean) => void,
    ) => void;
  }

  interface MulterInstance {
    single(fieldName: string): (req: Request, res: Response, next: NextFunction) => void;
    array(fieldName: string, maxCount?: number): (req: Request, res: Response, next: NextFunction) => void;
    fields(fields: { name: string; maxCount?: number }[]): (req: Request, res: Response, next: NextFunction) => void;
    none(): (req: Request, res: Response, next: NextFunction) => void;
  }

  function multer(options?: MulterOptions): MulterInstance;

  namespace multer {
    function memoryStorage(): StorageEngine;
    function diskStorage(options: {
      destination: string | ((req: Request, file: Express.Multer.File, callback: (error: Error | null, destination: string) => void) => void);
      filename: (req: Request, file: Express.Multer.File, callback: (error: Error | null, filename: string) => void) => void;
    }): StorageEngine;
  }

  export default multer;
}
