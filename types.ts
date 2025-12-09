
import React from 'react';

export interface User {
    username: string;
    role: 'admin' | 'user';
    password?: string;
    isLocked?: boolean;
}

export interface LineData {
  id: string;
  content: string;
  status: 'pending' | 'reviewed';
  comment: string | null;
}

export interface FileData {
  id:string;
  name: string;
  content: string;
  lines: LineData[];
}

export interface ContextMenuData {
  x: number;
  y: number;
  lineId: string;
}

export interface GenericModalData {
  title: string;
  content: React.ReactNode;
  modalClass?: string;
  confirmText?: string;
}

export interface SearchResult {
  type: 'line' | 'file';
  fileIndex: number;
  lineIndex?: number;
  lineId?: string;
  fileName: string;
  lineContent?: string;
  contextBefore?: string[];
  contextAfter?: string[];
  auditFile?: AuditFile;
  auditFileCategory?: AuditFileCategoryKey;
}

export interface AlertItem {
  fileId: string;
  fileName: string;
  lineId: string;
  lineIndex: number;
  lineContent: string;
  comment: string;
}

export interface IdentifierLocation {
    fileId: string;
    fileName: string;
    lineId: string;
    lineContent: string;
    identifierName: 'ndec' | 'ndeci' | 'ndex';
}

export interface DuplicateIdentifierGroup {
    identifierValue: string;
    locations: IdentifierLocation[];
    totalVusd: number;
    totalVusdi: number;
    totalNdec: number;
    totalNdeci: number;
    totalNdex: number;
}

export interface ExtractedDeclaration {
    fileName: string;
    ndec: string;
    fdec: string; 
}

export interface DeclarationLink {
    xmlLocation: IdentifierLocation;
    declaration: ExtractedDeclaration;
    customsFile?: string; 
}

export interface AuditDetails {
  companyName: string;
  nit: string;
  startDate: string;
  endDate: string;
  auditorName?: string;
}

export interface AuditFile {
  id: string;
  file: File;
  password?: string;
}

export type AuditFileCategoryKey = 'declaraciones' | 'banrep' | 'extractos' | 'soportesAduaneros' | 'soportesBancarios' | 'xmls';

export interface AuditFileCategory {
  declaraciones: AuditFile[];
  banrep: AuditFile[];
  extractos: AuditFile[];
  soportesAduaneros: AuditFile[];
  soportesBancarios: AuditFile[];
  xmls: AuditFile[];
}

export interface BalanceData {
  saldoInicial: number | 'N/A';
  ingresos: number | 'N/A';
  egresos: number | 'N/A';
  saldoFinal: number | 'N/A';
}

export interface BalanceComparisonRow {
  month: string;
  banrep: BalanceData;
  extracto: BalanceData;
  estadoTransmision: 'Oportuna' | 'Extemporánea' | 'N/A' | 'Pendiente';
}

export interface NdcLink {
  ndc: string;
  xmlLocation: IdentifierLocation;
  declaracionFile: string;
}

export interface ChronologicalEvent {
  month: string;
  date: string;
  description: string;
  sourceFile: string;
  category: string;
}

export interface AnalysisResults {
  balanceComparison: BalanceComparisonRow[];
  ndcLinks: NdcLink[];
  chronologicalReport: ChronologicalEvent[];
}

export interface SerializableFileMetadata {
    name: string;
    size: number;
    type: string;
    lastModified: number;
}

export interface SerializableAuditFile {
  id: string;
  file: SerializableFileMetadata;
  content?: string; 
  password?: string;
}

export interface SerializableAuditFileCategory {
  declaraciones: SerializableAuditFile[];
  banrep: SerializableAuditFile[];
  extractos: SerializableAuditFile[];
  soportesAduaneros: SerializableAuditFile[];
  soportesBancarios: SerializableAuditFile[];
  xmls: SerializableAuditFile[];
}

export interface PdfAnnotation {
    id: string;
    page: number;
    x: number; // percentage 0-1
    y: number; // percentage 0-1
    text: string;
    author: string;
    createdAt: string;
}

export interface ProgressData {
    version: number;
    auditDetails: AuditDetails;
    auditFiles: SerializableAuditFileCategory;
    fileData: FileData[]; 
    customComments: string[]; // Bank of reusable comments
    chronologicalMovements?: AuditMovement[]; 
    declarationReviews?: DeclarationReview[];
    processedDeclarations?: ProcessedDeclaration[];
}

export type CorrectionStatus = 'CORREGIDO' | 'SIN CORREGIR';

export interface ReviewAreaData {
    status: string;
    correctionStatus: CorrectionStatus | null;
    correctionDate: string | null;
}

export interface ReviewData {
    documental: ReviewAreaData;
    banrep: ReviewAreaData;
    dian: ReviewAreaData;
    comments: string;
}

export interface AuditOperation {
    id: string;
    amount: number;
    includeInReview: boolean;
    reviewData: ReviewData;
}

export interface SmartLink {
    type: 'xml' | 'pdf';
    label: string;
    targetFileId?: string;
    targetLineId?: string;
    targetFileName: string;
}

export interface AuditMovement {
    id: string;
    date: string; 
    description: string;
    amount: number; 
    sourceFile: string;
    operations: AuditOperation[];
    linkedDeclarations?: SmartLink[];
    linkedXmls?: SmartLink[];
}

export interface SelectionSummary {
    vusd: { sum: number; count: number } | null;
    vusdi: { sum: number; count: number } | null;
}

export interface ActivityLog {
    [username: string]: {
        [date: string]: number;
    }
}

export interface DeclarationMetadata {
    numero: string;
    fecha: string; // YYYY-MM-DD
    nit: string;
    numeral: string;
    valor: number;
    moneda: string;
    tipoOperacion: string; // 'Ingreso' | 'Egreso'
}

export interface DeclarationReview {
    fileId: string;
    fileName: string;
    status: 'pending' | 'approved' | 'correction_needed';
    metadata: DeclarationMetadata;
    auditorComments: string; // Comentarios generales
    annotations?: PdfAnnotation[]; // Notas sobre el PDF (coordinates)
    reviewedBy: string;
    reviewedAt?: string;
}

// New Interface for processed declarations used in linking
export interface ProcessedDeclaration {
    id: string;
    fileName: string;
    date: string;
    amount: number;
    number: string; // NDEC
    numeral?: string; // Nuevo campo para el Numeral Cambiario
    contentSample: string;
}
