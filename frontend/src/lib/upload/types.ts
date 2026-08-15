export type UploadStatus =
  | 'queued'
  | 'uploading'
  | 'analyzing'
  | 'av-scanning'
  | 'ready'
  | 'failed'
  | 'cancelled';

export interface UploadTaskInput {
  assetId: string;
  versionId: string;
  file: File;
  relativePath: string;
}

export interface UploadTask {
  id: string;
  input: UploadTaskInput;
  status: UploadStatus;
  bytesUploaded: number;
  totalBytes: number;
  error?: string;
  /** Once finalized, the backend's file id (so analyzer/AV WS events can be mapped). */
  fileId?: string;
  /** Multipart upload id, retained for abort. */
  uploadId?: string;
}

export interface InitiateUploadResponse {
  uploadId: string;
  putUrl: string;
  key: string;
  fileId: string;
  expiresAt: string;
}

export interface InitiateMultipartResponse {
  uploadId: string;
  key: string;
  fileId: string;
  partUrls: { partNumber: number; url: string }[];
  expiresAt: string;
}

export interface MultipartPart {
  partNumber: number;
  etag: string;
}
