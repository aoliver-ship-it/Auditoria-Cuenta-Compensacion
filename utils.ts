
import { FileData, LineData, PdfAnnotation } from './types';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Declare pdf.js global library, loaded from a script tag in index.html
declare const pdfjsLib: any;

export const formatCurrency = (amount: number, currency: string = 'USD') => {
    return amount.toLocaleString('es-CO', { 
        style: 'currency', 
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

export const PREDEFINED_COMMENTS = [
    "Legalización PARCIAL",
    "Legalización con ERROR",
    "Legalización EXTEMPORANEA",
    "Legalizado OPORTUNAMENTE",
    "NO requiere legalización por ser Devolución",
    "O.K.",
    "SIN Identificar",
    "SIN LEGALIZAR",
    "Mal Registrada"
];

const SAFE_COMMENTS_SET = new Set([
    "o.k.", "o.k", "ok", "legalizado", "legalizado oportunamente"
]);

export const isAlertComment = (comment: string | null): boolean => {
    if (!comment) return false;
    const normalized = comment.trim().toLowerCase();
    return !SAFE_COMMENTS_SET.has(normalized);
};

export const isMainRecordLine = (content: string): boolean => {
    const trimmed = content.trim();
    const recordTags = /<(Registro|Item|Declaracion|Factura|Comprobante|cservicios|operaciones)/i;
    return recordTags.test(trimmed);
};

export const extractXmlAttributes = (content: string) => {
    const vusdMatch = content.match(/vusd="([^"]+)"/i);
    const vusdiMatch = content.match(/vusdi="([^"]+)"/i);
    return {
        vusd: vusdMatch ? parseFloat(vusdMatch[1]) : 0,
        vusdi: vusdiMatch ? parseFloat(vusdiMatch[1]) : 0
    };
};

/**
 * Gets the PDF library instance, handling dynamic imports if necessary.
 */
export const getPdfLib = async () => {
    let pdfLib = (window as any).pdfjsLib;

    // If not found globally, try to import it dynamically from the CDN
    if (!pdfLib) {
        try {
            // Dynamic import for ES module environment
            const module = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs');
            pdfLib = module;
            
            // Set worker source explicitly
            if (pdfLib.GlobalWorkerOptions) {
                pdfLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs';
            }
        } catch (e) {
            console.error("Failed to load pdf.js dynamically", e);
            // Fallback: try to use window.pdfjsLib if the script tag loaded late
            pdfLib = (window as any).pdfjsLib;
        }
    } else {
        // If found globally, ensure worker is set
        if (!pdfLib.GlobalWorkerOptions.workerSrc) {
            pdfLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs';
        }
    }

    if (!pdfLib) throw new Error("No se pudo cargar la librería de lectura de PDF. Verifica tu conexión a internet.");
    return pdfLib;
};

/**
 * Extracts text content from a PDF file using the pdf.js library.
 */
export const extractTextFromPdf = async (file: File): Promise<string[]> => {
    if (file.size === 0) {
        console.warn(`El archivo PDF "${file.name}" está vacío (0 bytes). Se omitirá.`);
        return [];
    }

    try {
        const pdfLib = await getPdfLib();
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        const allPagesText: string[] = [];

        const pagePromises = [];
        for (let i = 1; i <= numPages; i++) {
            pagePromises.push(
                pdf.getPage(i).then((page: any) => page.getTextContent())
            );
        }

        const allTextContents = await Promise.all(pagePromises);

        for (const textContent of allTextContents) {
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            allPagesText.push(pageText);
        }

        return allPagesText;
    } catch (error) {
        console.error(`Error parsing PDF ${file.name}:`, error);
        return []; // Return empty text on failure rather than crashing the whole process
    }
};

/**
 * Merges multiple PDF files into a single PDF Document using pdf-lib.
 */
export const mergePdfFiles = async (files: File[]): Promise<Uint8Array> => {
    try {
        const mergedPdf = await PDFDocument.create();
        
        for (const file of files) {
            const arrayBuffer = await file.arrayBuffer();
            // Load the source PDF
            const pdf = await PDFDocument.load(arrayBuffer);
            // Copy all pages
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            // Add pages to the new document
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
        
        return await mergedPdf.save();
    } catch (error) {
        console.error("Error merging PDFs:", error);
        throw new Error("Falló la unificación de los PDFs. Asegúrese de que los archivos sean PDFs válidos.");
    }
};

/**
 * Writes annotations directly onto the PDF pages for printing/export.
 */
export const burnAnnotationsToPdf = async (originalPdfBytes: ArrayBuffer, annotations: PdfAnnotation[]): Promise<Uint8Array> => {
    const pdfDoc = await PDFDocument.load(originalPdfBytes);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    for (const ann of annotations) {
        // Annotation page index is 1-based usually in UI, ensure correct mapping
        const pageIndex = ann.page - 1;
        if (pageIndex >= 0 && pageIndex < pages.length) {
            const page = pages[pageIndex];
            const { width, height } = page.getSize();
            
            // Convert percentage coordinates back to PDF point coordinates
            // PDF coordinates start at bottom-left, DOM starts top-left.
            const x = ann.x * width;
            const y = height - (ann.y * height); 

            // Split text by newlines to handle multi-line comments
            const lines = ann.text.split('\n');
            const fontSize = 10;
            const lineHeight = 12;

            // Draw text (Blue color)
            for (let i = 0; i < lines.length; i++) {
                page.drawText(lines[i], {
                    x: x,
                    y: y - (i * lineHeight), // Move down for each line
                    size: fontSize,
                    font: helveticaFont,
                    color: rgb(0, 0, 1), // Blue
                });
            }
        }
    }

    return await pdfDoc.save();
};

export const DOCUMENTAL_OPTIONS = [
    "BL - DAV", "BL - Declaración Simplificada", "BL - DEX", "Carta desembolso",
    "Certificación Giro Cliente diferente", "Certificación Giro Proveedor diferente",
    "D/Andina V - C/Origen", "DC - Factura - Swift - BL - DIM",
    "DC - Factura - Swift - BL - DIM - DAV", "DC IMC", "Declaración Simplificada",
    "DEX", "DIM", "F10 - IM transmitido", "F3", "F3a", "F4", "F6", "F7",
    "Factura", "Factura - BL - DAV", "Factura - BL - DIM - DAV", "Factura - D/Transp",
    "Factura - DAV", "Factura - DIM", "Factura - Swift", "Factura - Swift - BL",
    "Factura - Swift - BL - DEX", "FMM-Ingreso ZF",
    "FMM-Ingreso ZF + (BL-Guía Aérea-Carta Porte)", "FMM-Salida ZF",
    "FMM-Salida ZF + (BL-Guía Aérea-Carta Porte)", "Guía Aérea - Declaración Simplificada",
    "Nota Crédito (Impo-Exportación)", "Nota Debito (Impo-Expo)", "Nota Liquidación - DC",
    "Nota Liquidación Divisas", "O.K.", "Swift", "Swift - BL", "Swift - BL - DEX",
    "Swift - BL - NC", "Swift - C/ Origen", "Swift - D/ Andina V", "Swift - DC",
    "Swift - Factura - BL - DEX", "Swift - NC", "Swift - Nota Liquidación"
];

export const BANREP_OPTIONS = [
    "MAL REGISTRADA", "O.K.", "SIN IDENTIFICAR", "Sin Transmitir", "Transmisión Extemporánea"
];

export const DIAN_OPTIONS = [
    "LEGALIZACION PARCIAL", "LEGALIZADO CON ERROR", "LEGALIZADO EXTEMPORANEO",
    "LEGALIZADO OPORTUNAMENTE", "NO requiere legalización por ser Devolución",
    "O.K.", "SIN IDENTIFICAR", "SIN LEGALIZAR"
];

export const CORRECTION_STATUS_OPTIONS: { value: 'CORREGIDO' | 'SIN CORREGIR', label: string, className: string }[] = [
    { value: 'CORREGIDO', label: 'Corregido', className: 'text-green-700 font-semibold' },
    { value: 'SIN CORREGIR', label: 'Sin Corregir', className: 'text-red-700 font-semibold' }
];

export const NUMERAL_DESCRIPTIONS: Record<string, string> = {
    // Exportaciones
    "1000": "Reintegro por exportaciones de café.",
    "1010": "Reintegro por exportaciones de carbón incluidos los anticipos.",
    "1020": "Reintegro por exportaciones de ferroníquel incluidos los anticipos.",
    "1030": "Reintegro por exportaciones de petróleo y sus derivados, incluidos los anticipos.",
    "1040": "Reintegro por exportaciones de bienes diferentes de café, carbón, ferroníquel, petróleo.",
    "1043": "Reintegro por exportaciones de bienes en un plazo superior a los doce (12) meses, financiados por el exportador.",
    "1045": "Anticipos por exportaciones de café.",
    "1050": "Anticipos por exportaciones de bienes diferentes de café, carbón, ferroníquel, petróleo.",
    "1060": "Pago de exportaciones de bienes en moneda legal colombiana.",
    "1510": "Gastos de exportación de bienes incluidos en la declaración de exportación definitiva.",
    // Importaciones
    "2015": "Giro por importaciones de bienes ya embarcados en un plazo igual o inferior a un (1) mes.",
    "2016": "Gastos de importación de bienes incluidos en la factura de los proveedores.",
    "2017": "Pago anticipado de futuras importaciones de bienes.",
    "2022": "Giro por importaciones > 1 mes y <= 12 meses (Proveedores).",
    "2023": "Giro por importaciones > 1 mes y <= 12 meses (IMC).",
    "2024": "Giro por importaciones > 12 meses (Proveedores).",
    "2025": "Giro por importaciones > 12 meses (IMC).",
    "2060": "Pago de importación de bienes en moneda legal colombiana.",
    // Servicios y Otros
    "1600": "Compra a residentes que compran y venden divisas de manera profesional.",
    "1601": "Otros conceptos (Ingresos).",
    "2904": "Otros conceptos (Egresos).",
    "1704": "Comisiones no financieras (Ingresos).",
    "2850": "Comisiones no financieras (Egresos).",
    "1540": "Servicios financieros (Ingresos).",
    "2270": "Servicios financieros (Egresos).",
    "1706": "Viajes de negocios, gastos educativos (Ingresos).",
    "2900": "Viajes de negocios, gastos educativos (Egresos).",
    "1840": "Servicios empresariales, profesionales y técnicos (Ingresos).",
    "2906": "Servicios empresariales, profesionales y técnicos (Egresos).",
    // Endeudamiento
    "4000": "Desembolso de créditos – deuda privada- otorgados por IMC a residentes.",
    "4500": "Amortización de créditos – deuda privada- otorgados por IMC a residentes.",
    "4005": "Desembolso de créditos - deuda privada- otorgados por no residentes.",
    "4505": "Amortización de créditos - deuda privada- otorgados por proveedores u otros no residentes.",
    "1630": "Intereses y comisiones por créditos otorgados por residentes a no residentes.",
    "2125": "Intereses de créditos –deuda privada- otorgados por IMC a residentes.",
    "2135": "Intereses de créditos –deuda privada- otorgados por proveedores u otros no residentes.",
    // Inversiones
    "4030": "Inversión de portafolio de capitales del exterior.",
    "4035": "Inversión directa de capitales del exterior en empresas.",
    "4560": "Giro al exterior de la inversión directa y suplementaria de capitales del exterior.",
    "4580": "Inversión colombiana directa en el exterior.",
    "4055": "Retorno de la inversión colombiana directa en el exterior.",
    // Cuentas Compensación
    "5378": "Traslados entre cuentas de compensación de un mismo titular. Ingresos.",
    "5912": "Traslados entre cuentas de compensación de un mismo titular. Egresos.",
    "5387": "Ingresos por traslados desde la cuenta del mercado no regulado del mismo titular.",
    "5917": "Egresos por traslados a la cuenta del mercado no regulado del mismo titular.",
    "5380": "Compra de divisas a otros titulares de cuentas de compensación (Ingreso).",
    "5909": "Venta de divisas a otros titulares de cuentas de compensación (Egreso).",
    "3500": "Egreso para el cumplimiento de obligaciones derivadas de operaciones internas.",
    "3000": "Ingreso por el cumplimiento de obligaciones derivadas de operaciones internas."
};
