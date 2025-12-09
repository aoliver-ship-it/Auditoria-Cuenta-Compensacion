
import React, { useState, useEffect, useMemo, useRef } from 'react';
import LoginScreen from './components/LoginScreen';
import ChronologicalAuditView from './components/ChronologicalAuditView';
import DeclarationReviewView from './components/DeclarationReviewView';
import FileManagementView from './components/FileManagementView';
import AuditDashboard from './components/AuditDashboard'; 
import { DashboardXmlStats } from './components/SummaryViews';
import UserManagementModal from './components/UserManagementModal';
import UsageStatsModal from './components/UsageStatsModal';
import AdminSessionSelector from './components/AdminSessionSelector';
import SessionRecoveryModal from './components/SessionRecoveryModal';
import ProgressLoadedModal from './components/ProgressLoadedModal';
import LineComponent from './components/LineComponent';
import CommentModal from './components/CommentModal';
import { 
    LogoutIcon, BriefcaseIcon, ChartBarIcon, DocumentCheckIcon, 
    UsersIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, UploadIcon, FilePdfIcon,
    SaveIcon, TableIcon, CheckIcon, SearchIcon, CloseIcon, CalculatorIcon
} from './components/icons';
import { 
    User, ProgressData, AuditMovement, AuditFileCategory, 
    FileData, DeclarationReview, ProcessedDeclaration, SmartLink, AuditFile, AuditDetails
} from './types';
import * as storageService from './services/storageService';
import * as geminiService from './services/geminiService';
import { extractTextFromPdf, extractXmlAttributes, formatCurrency, PREDEFINED_COMMENTS } from './utils';

declare const jspdf: any;

const App: React.FC = () => {
    // Session State
    const [user, setUser] = useState<User | null>(null);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [activeView, setActiveView] = useState<'xml' | 'chronological' | 'documents' | 'audit' | 'dashboard'>('audit'); 

    // Data State
    const [auditDetails, setAuditDetails] = useState<AuditDetails>({
        companyName: '',
        nit: '',
        startDate: '',
        endDate: '',
        auditorName: ''
    });
    const [fileData, setFileData] = useState<FileData[]>([]);
    const [movements, setMovements] = useState<AuditMovement[]>([]);
    const [reviews, setReviews] = useState<DeclarationReview[]>([]);
    const [auditFiles, setAuditFiles] = useState<AuditFileCategory>({
        declaraciones: [], banrep: [], extractos: [], soportesAduaneros: [], soportesBancarios: [], xmls: []
    });
    
    // Comment Bank State
    const [customComments, setCustomComments] = useState<string[]>(PREDEFINED_COMMENTS);

    // Linking & Metadata State
    const [processedDeclarations, setProcessedDeclarations] = useState<ProcessedDeclaration[]>([]);
    const [selectedDeclarationId, setSelectedDeclarationId] = useState<string | null>(null);
    const [activePdfSearchTerm, setActivePdfSearchTerm] = useState<string>('');

    // XML View State
    const [activeXmlFileId, setActiveXmlFileId] = useState<string | null>(null);
    const [xmlCurrentPage, setXmlCurrentPage] = useState(1);
    const [highlightedLineId, setHighlightedLineId] = useState<string | null>(null); 
    const [xmlSearchTerm, setXmlSearchTerm] = useState(''); 
    const [commentModalData, setCommentModalData] = useState<{ lineId: string | null; position: { x: number; y: number }; lineContent: string; existingComment: string } | null>(null);
    const ITEMS_PER_PAGE = 100;
    
    // New XML State
    const [isXmlSidebarOpen, setIsXmlSidebarOpen] = useState(true);
    const [selectedXmlLines, setSelectedXmlLines] = useState<Set<string>>(new Set());

    // Process State
    const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
    const [isProcessingDeclarations, setIsProcessingDeclarations] = useState(false);
    const [lastAutoSave, setLastAutoSave] = useState<string | null>(null);

    // Modals State
    const [showUserManagement, setShowUserManagement] = useState(false);
    const [showUsageStats, setShowUsageStats] = useState(false);
    const [showAdminSession, setShowAdminSession] = useState(false);
    const [showRecovery, setShowRecovery] = useState(false);
    const [showProgressLoaded, setShowProgressLoaded] = useState(false);

    // --- Auto-Save Logic using Refs ---
    const stateRef = useRef({
        user, fileData, movements, reviews, auditFiles, processedDeclarations, auditDetails, customComments
    });

    useEffect(() => {
        stateRef.current = { user, fileData, movements, reviews, auditFiles, processedDeclarations, auditDetails, customComments };
    }, [user, fileData, movements, reviews, auditFiles, processedDeclarations, auditDetails, customComments]);

    useEffect(() => {
        if (!user) return;

        const autoSaveInterval = setInterval(async () => {
            const current = stateRef.current;
            if (!current.user) return;

            console.log("Ejecutando autoguardado...");
            // Ensure auditor name is kept updated with current user if not set
            const currentAuditDetails = { 
                ...current.auditDetails, 
                auditorName: current.auditDetails.auditorName || current.user.username 
            };

            const dataToSave: ProgressData = {
                version: 1,
                auditDetails: currentAuditDetails,
                customComments: current.customComments,
                chronologicalMovements: current.movements,
                fileData: current.fileData,
                declarationReviews: current.reviews,
                processedDeclarations: current.processedDeclarations,
                auditFiles: current.auditFiles
            };

            try {
                await storageService.saveSessionToDB(current.user.username, dataToSave);
                setLastAutoSave(new Date().toLocaleTimeString());
            } catch (error) {
                console.error("Autosave failed", error);
            }
        }, 5 * 60 * 1000); 

        return () => clearInterval(autoSaveInterval);
    }, [user]); 

    // Set default active XML if available and none selected
    useEffect(() => {
        if (activeView === 'xml' && !activeXmlFileId && fileData.length > 0) {
            setActiveXmlFileId(fileData[0].id);
        }
    }, [activeView, fileData, activeXmlFileId]);

    const handleLoginSuccess = async (loggedInUser: User, loadedData?: ProgressData) => {
        if (loadedData) {
            loadProgressData(loadedData);
            setUser(loggedInUser);
            setShowProgressLoaded(true);
        } else {
            const hasSession = await storageService.checkSessionExists(loggedInUser.username);
            if (hasSession) {
                setUser(loggedInUser); 
                setShowRecovery(true);
            } else {
                setUser(loggedInUser);
                // Set default auditor name for new session
                setAuditDetails(prev => ({ ...prev, auditorName: loggedInUser.username }));
            }
        }
    };

    const loadProgressData = async (data: ProgressData) => {
        if (data.auditDetails) {
            setAuditDetails(data.auditDetails);
        }
        setFileData(data.fileData || []);
        setMovements(data.chronologicalMovements || []);
        setReviews(data.declarationReviews || []);
        if (data.processedDeclarations && Array.isArray(data.processedDeclarations)) {
            setProcessedDeclarations(data.processedDeclarations);
        }
        if (data.customComments && Array.isArray(data.customComments)) {
            setCustomComments(data.customComments);
        }
        const reconstructedFiles = storageService.reconstructAuditFiles(data.auditFiles);
        setAuditFiles(reconstructedFiles);
    };

    const handleDownloadProgress = async () => {
        if (!user) return;
        const currentData: ProgressData = {
            version: 1,
            auditDetails: auditDetails,
            customComments: customComments,
            chronologicalMovements: movements,
            fileData: fileData,
            declarationReviews: reviews,
            processedDeclarations: processedDeclarations,
            auditFiles: { ...auditFiles }
        };

        try {
            const exportData = await storageService.prepareForJsonExport(currentData, auditFiles);
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `progreso_auditoria_${auditDetails.companyName.replace(/\s+/g, '_') || 'CCA'}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to export progress", error);
            alert("Error al generar el archivo de respaldo.");
        }
    };

    const handleLoadProgressFromFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                const parsed: ProgressData = JSON.parse(content);
                loadProgressData(parsed);
                setShowProgressLoaded(true);
            } catch (err) {
                console.error(err);
                alert("El archivo no es válido o está dañado.");
            }
        };
        reader.readAsText(file);
    };

    const handleRecoverSession = async () => {
        if (!user) return;
        const data = await storageService.loadSessionFromDB(user.username);
        if (data) {
            loadProgressData(data);
            setShowProgressLoaded(true);
        }
        setShowRecovery(false);
    };

    const handleDiscardSession = async () => {
        if (!user) return;
        await storageService.deleteSessionFromDB(user.username);
        setShowRecovery(false);
        setFileData([]);
        setMovements([]);
        setReviews([]);
        setProcessedDeclarations([]);
        setCustomComments(PREDEFINED_COMMENTS);
        setAuditDetails({ companyName: '', nit: '', startDate: '', endDate: '', auditorName: user.username });
        setAuditFiles({ declaraciones: [], banrep: [], extractos: [], soportesAduaneros: [], soportesBancarios: [], xmls: [] });
    };

    const handleLogout = () => {
        setUser(null);
        setFileData([]);
        setMovements([]);
        setReviews([]);
        setProcessedDeclarations([]);
        setCustomComments(PREDEFINED_COMMENTS);
        setAuditDetails({ companyName: '', nit: '', startDate: '', endDate: '', auditorName: '' });
        setAuditFiles({ declaraciones: [], banrep: [], extractos: [], soportesAduaneros: [], soportesBancarios: [], xmls: [] });
        setActiveView('audit');
    };

    const handleAdminSelectSession = async (targetUsername: string) => {
        const data = await storageService.loadSessionFromDB(targetUsername);
        if (data) {
            loadProgressData(data);
            setShowProgressLoaded(true);
        } else {
            alert("No se pudo cargar la sesión del usuario.");
        }
    };

    const processNewDeclarations = async (newFiles: AuditFile[]) => {
        setIsProcessingDeclarations(true);
        try {
            const docsToProcess = [];
            for (const fileObj of newFiles) {
                try {
                    const pages = await extractTextFromPdf(fileObj.file);
                    const fullText = pages.join('\n');
                    docsToProcess.push({
                        id: fileObj.id,
                        name: fileObj.file.name,
                        content: fullText
                    });
                } catch (e) {
                    console.error("Error extracting text from PDF", fileObj.file.name, e);
                }
            }

            if (docsToProcess.length > 0) {
                const results = await geminiService.extractBulkDeclarationMetadata(docsToProcess);
                setProcessedDeclarations(prev => {
                    const existingIds = new Set(prev.map(p => p.id));
                    const uniqueNew = results.filter(r => !existingIds.has(r.id));
                    return [...prev, ...uniqueNew];
                });
            }
        } catch (error) {
            console.error("Error processing declarations automatically:", error);
        } finally {
            setIsProcessingDeclarations(false);
        }
    };

    const handleFilesAdded = async (category: keyof AuditFileCategory, files: File[]) => {
        const newFilesToAdd: AuditFile[] = [];
        const newFileDataToAdd: FileData[] = [];

        for (const file of files) {
             const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
             newFilesToAdd.push({ id: fileId, file: file });

             if (category === 'xmls') {
                const text = await file.text();
                const lines = text.split('\n').map((line, i) => ({
                    id: `line-${fileId}-${i}-${Math.random().toString(36).substring(2, 5)}`,
                    content: line,
                    status: 'pending' as const,
                    comment: null
                })).filter(l => l.content.trim() !== '');

                newFileDataToAdd.push({
                    id: fileId, // Consistent ID
                    name: file.name,
                    content: text,
                    lines: lines
                });
             }
        }

        setAuditFiles(prev => ({
            ...prev,
            [category]: [...prev[category], ...newFilesToAdd]
        }));

        if (category === 'xmls' && newFileDataToAdd.length > 0) {
            setFileData(prev => [...prev, ...newFileDataToAdd]);
        }

        if (category === 'declaraciones') {
            processNewDeclarations(newFilesToAdd);
        }
    };

    const handleRemoveFile = (category: keyof AuditFileCategory, fileId: string) => {
        if (!window.confirm("¿Está seguro de que desea eliminar este archivo?")) return;
        
        // Remove from file registry
        setAuditFiles(prev => ({
            ...prev,
            [category]: prev[category].filter(f => f.id !== fileId)
        }));

        // Cleanup associated data
        if (category === 'xmls') {
            setFileData(prev => prev.filter(fd => fd.id !== fileId));
            if (activeXmlFileId === fileId) {
                setActiveXmlFileId(null);
            }
        }
        
        if (category === 'declaraciones') {
            setProcessedDeclarations(prev => prev.filter(p => p.id !== fileId));
            if (selectedDeclarationId === fileId) {
                setSelectedDeclarationId(null);
            }
        }
    };

    const handleGenerateTemplate = async () => {
        if (auditFiles.extractos.length === 0) {
            alert("Por favor cargue al menos un archivo en la categoría 'Extractos Bancarios' para generar la plantilla.");
            return;
        }

        setIsGeneratingTemplate(true);

        try {
            const statementsData = [];
            for (const fileObj of auditFiles.extractos) {
                try {
                    const pages = await extractTextFromPdf(fileObj.file);
                    statementsData.push({ name: fileObj.file.name, contentPages: pages });
                } catch (err) {
                    console.error(`Error reading PDF ${fileObj.file.name}`, err);
                }
            }

            if (statementsData.length === 0) {
                alert("No se pudo leer el contenido de los extractos. Asegúrese de que sean PDFs válidos.");
                setIsGeneratingTemplate(false);
                return;
            }

            const newMovements = await geminiService.extractMovementsFromStatements(statementsData);

            if (newMovements.length === 0) {
                alert("La IA no pudo identificar movimientos en los archivos proporcionados.");
            } else {
                setMovements(newMovements);
                setActiveView('chronological'); 
            }

        } catch (error) {
            console.error("Error generating template:", error);
            alert("Ocurrió un error al generar la plantilla. Por favor intente nuevamente.");
        } finally {
            setIsGeneratingTemplate(false);
        }
    };

    const handleSaveCustomComment = (newComment: string) => {
        if (newComment && !customComments.includes(newComment)) {
            setCustomComments(prev => [...prev, newComment]);
        }
    };

    // --- XML Status Toggle Logic ---
    const handleToggleLineStatus = (fileId: string, lineId: string) => {
        setFileData(prev => prev.map(f => {
            if (f.id !== fileId) return f;
            return {
                ...f,
                lines: f.lines.map(l => {
                    if (l.id === lineId) {
                        return { ...l, status: l.status === 'reviewed' ? 'pending' : 'reviewed' };
                    }
                    return l;
                })
            };
        }));
    };

    // --- XML Finding Logic ---
    const handleFindXmlOperation = (ndc: string, amount: number, date: string, movementId?: string) => {
        if (fileData.length === 0) {
            alert("No hay información suficiente o archivos XML cargados para realizar la búsqueda.");
            return;
        }

        let found = false;
        const targetAmountStr = Math.abs(amount).toString();
        const targetAmountFixed = Math.abs(amount).toFixed(2);

        for (const file of fileData) {
            const targetIndex = file.lines.findIndex(line => {
                const content = line.content.toLowerCase();
                // 1. Try by Declaration Number if provided
                if (ndc && ndc.trim() !== '') {
                     if (content.includes(`ndec="${ndc}"`) || content.includes(`ndec="${Number(ndc)}"`)) {
                         return true;
                     }
                }
                // 2. Try by Amount (vusd)
                if (amount) {
                     if (content.includes(`vusd="${targetAmountStr}"`) || content.includes(`vusd="${targetAmountFixed}"`)) {
                         return true;
                     }
                }
                return false;
            });

            if (targetIndex !== -1) {
                found = true;
                setActiveXmlFileId(file.id);
                setXmlCurrentPage(Math.floor(targetIndex / ITEMS_PER_PAGE) + 1);
                
                const targetLineId = file.lines[targetIndex].id;
                setHighlightedLineId(targetLineId);

                // Mark as reviewed automatically on find
                setFileData(prev => prev.map(f => {
                    if (f.id === file.id) {
                        const newLines = [...f.lines];
                        if (newLines[targetIndex].status !== 'reviewed') {
                            newLines[targetIndex] = { ...newLines[targetIndex], status: 'reviewed' };
                            return { ...f, lines: newLines };
                        }
                    }
                    return f;
                }));
                
                if (movementId) {
                    setMovements(prev => prev.map(m => {
                        if (m.id === movementId) {
                            const newLink: SmartLink = {
                                type: 'xml',
                                label: `XML: ${file.name} (Línea ${targetIndex + 1})`,
                                targetFileId: file.id,
                                targetLineId: targetLineId,
                                targetFileName: file.name
                            };
                            const existingLinks = m.linkedXmls || [];
                            if (!existingLinks.some(l => l.targetFileId === file.id && l.targetLineId === targetLineId)) {
                                return { ...m, linkedXmls: [...existingLinks, newLink] };
                            }
                        }
                        return m;
                    }));
                }

                setTimeout(() => setHighlightedLineId(null), 60000);
                setActiveView('xml');
                break;
            }
        }

        if (!found) {
            alert(`No se encontró registro en XML para NDC: ${ndc || 'N/A'} o Valor: ${amount}`);
        }
    };

    // --- Global Search Navigation Logic ---
    const handleGlobalSearchNavigation = (result: { type: 'xml' | 'declaration', id: string, details: any }) => {
        if (result.type === 'xml') {
            setActiveXmlFileId(result.details.fileId);
            const file = fileData.find(f => f.id === result.details.fileId);
            if (file) {
                const lineIndex = file.lines.findIndex(l => l.id === result.id);
                if (lineIndex !== -1) {
                    setXmlCurrentPage(Math.floor(lineIndex / ITEMS_PER_PAGE) + 1);
                    setHighlightedLineId(result.id);
                    setTimeout(() => setHighlightedLineId(null), 60000);
                }
            }
            setActiveView('xml');
        } else if (result.type === 'declaration') {
            const auditFile = auditFiles.declaraciones.find(f => f.file.name === result.details.fileName);
            if (auditFile) {
                setSelectedDeclarationId(auditFile.id);
                if (result.details.number) {
                    setActivePdfSearchTerm(result.details.number);
                }
                setActiveView('documents');
            } else {
                alert("No se pudo encontrar el archivo PDF asociado.");
            }
        }
    };

    const handleOpenPdfFromXml = (declarationNumber: string) => {
        const meta = processedDeclarations.find(p => p.number === declarationNumber || p.number === declarationNumber.replace(/^0+/, ''));
        if (meta) {
            const file = auditFiles.declaraciones.find(f => f.file.name === meta.fileName);
            if (file) {
                setSelectedDeclarationId(file.id);
                setActivePdfSearchTerm(declarationNumber);
                setActiveView('documents');
                return;
            }
        }
        
        setActivePdfSearchTerm(declarationNumber);
        setActiveView('documents');
    };

    const handleGenerateReport = () => {
        if (typeof jspdf === 'undefined') {
            alert("La librería de generación de PDF no está cargada.");
            return;
        }

        const doc = new jspdf.jsPDF();
        
        // Header Info
        doc.setFontSize(18);
        doc.text("Informe Auditoría Cuenta de Compensación", 14, 22);
        
        doc.setFontSize(10);
        doc.text(`Empresa: ${auditDetails.companyName || 'N/A'}`, 14, 30);
        doc.text(`NIT: ${auditDetails.nit || 'N/A'}`, 14, 35);
        doc.text(`Periodo: ${auditDetails.startDate} - ${auditDetails.endDate}`, 14, 40);
        doc.text(`Auditor: ${user?.username}`, 14, 45);
        doc.text(`Generado el: ${new Date().toLocaleDateString()}`, 14, 50);

        doc.setFontSize(14);
        doc.text("Resumen Ejecutivo", 14, 60);
        
        let yPos = 70;
        let findings = 0;
        let totalOps = 0;
        movements.forEach(m => {
            m.operations.forEach(op => {
                totalOps++;
                if (op.reviewData.dian.status.includes('SIN') || op.reviewData.banrep.status.includes('SIN')) findings++;
            });
        });

        doc.setFontSize(10);
        doc.text(`Total Operaciones Auditadas: ${totalOps}`, 14, yPos);
        doc.text(`Hallazgos Críticos: ${findings}`, 14, yPos + 6);
        doc.text(`Declaraciones Revisadas: ${reviews.length}`, 14, yPos + 12);

        const head = [['Fecha', 'Descripción', 'Valor', 'DIAN', 'BANREP', 'Comentarios Auditor']];
        const body = movements.flatMap(m => m.operations.map(op => [
            m.date,
            m.description.substring(0, 40) + (m.description.length > 40 ? '...' : ''),
            op.amount.toLocaleString(),
            op.reviewData.dian.status,
            op.reviewData.banrep.status,
            op.reviewData.comments || ''
        ]));

        doc.autoTable({
            startY: yPos + 20,
            head: head,
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] },
            styles: { fontSize: 8 },
            columnStyles: {
                0: { cellWidth: 25 },
                1: { cellWidth: 50 },
                2: { cellWidth: 25, halign: 'right' },
                5: { cellWidth: 'auto' }
            }
        });

        doc.save(`Informe_Auditoria_${auditDetails.companyName.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const activeXmlFile = useMemo(() => fileData.find(f => f.id === activeXmlFileId), [fileData, activeXmlFileId]);
    const displayedXmlLines = useMemo(() => {
        if (!activeXmlFile) return [];
        const start = (xmlCurrentPage - 1) * ITEMS_PER_PAGE;
        return activeXmlFile.lines.slice(start, start + ITEMS_PER_PAGE);
    }, [activeXmlFile, xmlCurrentPage]);

    const totalXmlPages = activeXmlFile ? Math.ceil(activeXmlFile.lines.length / ITEMS_PER_PAGE) : 0;

    // Intelligent XML Search Logic
    const xmlSearchResults = useMemo(() => {
        if (!xmlSearchTerm || xmlSearchTerm.length < 2) return null;
        const term = xmlSearchTerm.toLowerCase();
        const results: { fileId: string, fileName: string, lineId: string, lineNumber: number, content: string, page: number }[] = [];

        fileData.forEach(file => {
            file.lines.forEach((line, index) => {
                if (line.content.toLowerCase().includes(term)) {
                    results.push({
                        fileId: file.id,
                        fileName: file.name,
                        lineId: line.id,
                        lineNumber: index + 1,
                        content: line.content,
                        page: Math.floor(index / ITEMS_PER_PAGE) + 1
                    });
                }
            });
        });
        return results;
    }, [xmlSearchTerm, fileData]);

    const handleNavigateToSearchResult = (result: any) => {
        setActiveXmlFileId(result.fileId);
        setXmlCurrentPage(result.page);
        setHighlightedLineId(result.lineId);
        setTimeout(() => setHighlightedLineId(null), 5000);
    };

    const handleOpenCommentModal = (lineId: string, clientX?: number, clientY?: number) => {
        const file = fileData.find(f => f.id === activeXmlFileId);
        if (!file) return;
        const line = file.lines.find(l => l.id === lineId);
        if (!line) return;

        const x = clientX || window.innerWidth / 2 - 250;
        const y = clientY || window.innerHeight / 2 - 150;

        setCommentModalData({
            lineId,
            position: { x, y },
            lineContent: line.content,
            existingComment: line.comment || ''
        });
    };

    const handleSaveComment = (comment: string, saveForFuture: boolean) => {
        if (!commentModalData?.lineId || !activeXmlFileId) return;
        
        // 1. Update XML Data
        setFileData(prev => prev.map(f => {
            if (f.id !== activeXmlFileId) return f;
            return { ...f, lines: f.lines.map(l => l.id === commentModalData.lineId ? { ...l, comment: comment, status: 'reviewed' as const } : l) };
        }));

        // 2. Sync to Chronological Audit if linked
        setMovements(prevMovements => prevMovements.map(m => {
            const isLinked = m.linkedXmls?.some(link => link.targetLineId === commentModalData.lineId);
            if (isLinked) {
                return {
                    ...m,
                    operations: m.operations.map(op => ({
                        ...op,
                        reviewData: {
                            ...op.reviewData,
                            comments: op.reviewData.comments 
                                ? `${op.reviewData.comments}\n[XML]: ${comment}` 
                                : `[XML]: ${comment}`
                        }
                    }))
                };
            }
            return m;
        }));

        if (saveForFuture) handleSaveCustomComment(comment);
        setCommentModalData(null);
    };

    const handleDeleteComment = () => {
        if (!commentModalData?.lineId || !activeXmlFileId) return;
        setFileData(prev => prev.map(f => {
            if (f.id !== activeXmlFileId) return f;
            return { 
                ...f, 
                lines: f.lines.map(l => l.id === commentModalData.lineId ? { ...l, comment: null } : l) 
            };
        }));
        setCommentModalData(null);
    };

    const handleUpdateLineContent = (lineId: string, newContent: string) => {
        if (!activeXmlFileId) return;
        setFileData(prev => prev.map(f => {
            if (f.id !== activeXmlFileId) return f;
            return { ...f, lines: f.lines.map(l => l.id === lineId ? { ...l, content: newContent } : l) };
        }));
    };
    
    // New XML Handlers
    const handleToggleXmlSelection = (lineId: string) => {
        setSelectedXmlLines(prev => {
            const next = new Set(prev);
            if (next.has(lineId)) next.delete(lineId);
            else next.add(lineId);
            return next;
        });
    };

    const xmlSelectionSummary = useMemo(() => {
        if (selectedXmlLines.size === 0) return null;
        let totalVusd = 0, totalVusdi = 0, count = 0;
        fileData.forEach(f => f.lines.forEach(l => {
            if(selectedXmlLines.has(l.id)) {
                const attrs = extractXmlAttributes(l.content);
                totalVusd += attrs.vusd; totalVusdi += attrs.vusdi; count++;
            }
        }));
        return { vusd: totalVusd, vusdi: totalVusdi, count };
    }, [selectedXmlLines, fileData]);

    if (!user) {
        return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
    }

    return (
        <div className="flex h-screen w-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
            {/* Sidebar */}
            <div className={`bg-slate-900 text-slate-300 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'w-16' : 'w-64'} flex-shrink-0 z-50`}>
                <div className="p-4 flex items-center justify-between border-b border-slate-800 h-16">
                    {!isSidebarCollapsed && (
                        <div>
                            <h1 className="font-bold text-white tracking-wider">CCA</h1>
                            <p className="text-[10px] text-slate-500">Auditoría Cambiaria</p>
                        </div>
                    )}
                    <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-1 hover:bg-slate-800 rounded">
                        {isSidebarCollapsed ? <ChevronRightIcon className="w-5 h-5" /> : <ChevronLeftIcon className="w-5 h-5" />}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto py-4 space-y-2">
                    <p className={`px-4 text-[10px] uppercase font-bold text-slate-600 mb-1 ${isSidebarCollapsed ? 'hidden' : 'block'}`}>1. Carga</p>
                    <SidebarItem 
                        icon={<UploadIcon />} 
                        label="Carga de Archivos" 
                        active={activeView === 'audit'} 
                        collapsed={isSidebarCollapsed}
                        onClick={() => setActiveView('audit')} 
                    />
                    
                    <div className="my-2 border-t border-slate-800 mx-4 opacity-50"></div>
                    
                    <p className={`px-4 text-[10px] uppercase font-bold text-slate-600 mb-1 ${isSidebarCollapsed ? 'hidden' : 'block'}`}>2. Auditoría</p>
                    <SidebarItem 
                        icon={<BriefcaseIcon />} 
                        label="Plantilla Cronológica" 
                        active={activeView === 'chronological'} 
                        collapsed={isSidebarCollapsed}
                        onClick={() => setActiveView('chronological')} 
                    />
                    <SidebarItem 
                        icon={<ChartBarIcon />} 
                        label="Revisión XML" 
                        active={activeView === 'xml'} 
                        collapsed={isSidebarCollapsed}
                        onClick={() => setActiveView('xml')} 
                    />
                    <SidebarItem 
                        icon={<DocumentCheckIcon />} 
                        label="Revisión Declaraciones" 
                        active={activeView === 'documents'} 
                        collapsed={isSidebarCollapsed}
                        onClick={() => setActiveView('documents')} 
                    />

                    <div className="my-2 border-t border-slate-800 mx-4 opacity-50"></div>

                    <p className={`px-4 text-[10px] uppercase font-bold text-slate-600 mb-1 ${isSidebarCollapsed ? 'hidden' : 'block'}`}>3. Resultados</p>
                    <SidebarItem 
                        icon={<ChartBarIcon className="text-yellow-500" />} 
                        label="Dashboard" 
                        active={activeView === 'dashboard'} 
                        collapsed={isSidebarCollapsed}
                        onClick={() => setActiveView('dashboard')} 
                    />
                    
                    <button 
                        onClick={handleGenerateReport}
                        className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-slate-400 hover:bg-slate-800 hover:text-white ${isSidebarCollapsed ? 'justify-center' : ''}`}
                        title="Descargar PDF Informe"
                    >
                        <span className="w-5 h-5"><FilePdfIcon /></span>
                        {!isSidebarCollapsed && <span className="font-medium text-sm">Generar Informe</span>}
                    </button>

                    <div className="my-2 border-t border-slate-800 mx-4 opacity-50"></div>
                </div>

                {/* Fixed Footer with User Profile and SAVE Button */}
                <div className="p-4 border-t border-slate-800 bg-slate-900">
                    {/* Botón de Guardar Progreso */}
                    <button 
                        onClick={handleDownloadProgress}
                        className={`w-full flex items-center gap-3 px-3 py-2 mb-4 rounded-md transition-colors bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900 hover:text-emerald-300 border border-emerald-800/50 ${isSidebarCollapsed ? 'justify-center' : ''}`}
                        title="Guardar progreso en archivo .json"
                    >
                        <span className="w-5 h-5"><SaveIcon /></span>
                        {!isSidebarCollapsed && <span className="font-medium text-sm">Guardar Progreso</span>}
                    </button>

                    {!isSidebarCollapsed && (
                         <div className="mb-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-sm font-medium text-white truncate">{user.username}</p>
                                <p className="text-[10px] text-slate-500 capitalize flex items-center gap-1">
                                    {lastAutoSave ? (
                                        <>
                                            <CheckIcon className="w-3 h-3 text-green-500" />
                                            Guardado {lastAutoSave}
                                        </>
                                    ) : 'Sin guardar'}
                                </p>
                            </div>
                         </div>
                    )}
                    <button onClick={handleLogout} className={`flex items-center gap-3 text-slate-400 hover:text-white w-full ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                        <LogoutIcon className="w-5 h-5" />
                        {!isSidebarCollapsed && <span>Cerrar Sesión</span>}
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                <main className="flex-1 overflow-hidden relative bg-slate-100 p-0">
                    {activeView === 'audit' && (
                        <div className="p-2 h-full">
                            <FileManagementView 
                                auditDetails={auditDetails}
                                onUpdateAuditDetails={setAuditDetails}
                                auditFiles={auditFiles}
                                fileData={fileData}
                                processedDeclarations={processedDeclarations}
                                onFilesAdded={handleFilesAdded}
                                onGenerateTemplate={handleGenerateTemplate}
                                isGenerating={isGeneratingTemplate}
                                isProcessingDeclarations={isProcessingDeclarations}
                                onLoadProgress={handleLoadProgressFromFile}
                                onNavigateSearchResult={handleGlobalSearchNavigation}
                                onRemoveFile={handleRemoveFile}
                            />
                        </div>
                    )}

                    {activeView === 'chronological' && (
                        <div className="p-2 h-full flex flex-col">
                            <ChronologicalAuditView 
                                movements={movements}
                                setMovements={setMovements}
                                undo={() => {}} 
                                canUndo={false}
                                redo={() => {}} 
                                canRedo={false}
                                declarationsList={auditFiles.declaraciones.map(f => f.file.name)}
                                processedDeclarations={processedDeclarations}
                                onAddDeclarationLink={(mid, fname) => {
                                    setMovements(prev => prev.map(m => {
                                        if(m.id === mid) {
                                            const newLinks = [...(m.linkedDeclarations || [])];
                                            if(!newLinks.find(l => l.targetFileName === fname)) {
                                                newLinks.push({ type: 'pdf', label: fname, targetFileName: fname });
                                            }
                                            return { ...m, linkedDeclarations: newLinks };
                                        }
                                        return m;
                                    }));
                                }} 
                                onRemoveDeclarationLink={(mid, fname) => {
                                    setMovements(prev => prev.map(m => m.id === mid ? { ...m, linkedDeclarations: m.linkedDeclarations?.filter(l => l.targetFileName !== fname) } : m));
                                }}
                                onNavigate={(link) => {
                                    if (link.type === 'pdf') {
                                        const decFile = auditFiles.declaraciones.find(f => f.file.name === link.targetFileName);
                                        if (decFile) {
                                            setSelectedDeclarationId(decFile.id);
                                            setActivePdfSearchTerm(''); 
                                            setActiveView('documents');
                                        }
                                    } else if (link.type === 'xml') {
                                        if (link.targetFileId && link.targetLineId) {
                                            setActiveXmlFileId(link.targetFileId);
                                            setHighlightedLineId(link.targetLineId);
                                            const file = fileData.find(f => f.id === link.targetFileId);
                                            if (file) {
                                                 const idx = file.lines.findIndex(l => l.id === link.targetLineId);
                                                 if (idx !== -1) {
                                                     setXmlCurrentPage(Math.floor(idx / ITEMS_PER_PAGE) + 1);
                                                 }
                                            }
                                            setActiveView('xml');
                                        }
                                    }
                                }}
                                onFindXml={handleFindXmlOperation}
                                fileData={fileData}
                                reviews={reviews}
                            />
                        </div>
                    )}

                    {activeView === 'xml' && (
                        <div className="flex h-full overflow-hidden bg-white relative">
                            {/* XML Sidebar (Collapsible) */}
                            {isXmlSidebarOpen && (
                                <div className="w-80 bg-slate-50 border-r border-slate-200 flex flex-col flex-shrink-0 z-20">
                                     <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                                        <h3 className="font-bold text-slate-700">Archivos XML ({fileData.length})</h3>
                                        <button onClick={() => setIsXmlSidebarOpen(false)} className="text-slate-400 hover:text-slate-600"><ChevronLeftIcon className="w-4 h-4"/></button>
                                     </div>
                                     {/* Search Bar & List */}
                                     <div className="p-2 border-b border-slate-200">
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><SearchIcon className="h-4 w-4 text-indigo-500" /></div>
                                            <input type="text" className="w-full pl-9 pr-8 py-1.5 text-sm border border-slate-300 rounded-lg" placeholder="Buscar en XML..." value={xmlSearchTerm} onChange={(e) => setXmlSearchTerm(e.target.value)} />
                                            {xmlSearchTerm && <button onClick={() => setXmlSearchTerm('')} className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400"><CloseIcon className="w-3 h-3"/></button>}
                                        </div>
                                     </div>
                                     <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                        {xmlSearchTerm && xmlSearchResults ? (
                                            <>
                                                <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">{xmlSearchResults.length} Resultados</div>
                                                {xmlSearchResults.map((result, idx) => (
                                                    <button key={`${result.fileId}-${result.lineId}-${idx}`} onClick={() => handleNavigateToSearchResult(result)} className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all group mb-2 bg-white shadow-sm">
                                                        <div className="flex justify-between items-start mb-1"><span className="text-xs font-bold text-slate-700 truncate max-w-[180px]">{result.fileName}</span><span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 rounded">Línea {result.lineNumber}</span></div>
                                                        <code className="block text-[10px] text-slate-500 font-mono bg-slate-50 p-1 rounded truncate border border-slate-100 group-hover:bg-white group-hover:border-indigo-100 group-hover:text-indigo-700">{result.content.trim()}</code>
                                                    </button>
                                                ))}
                                            </>
                                        ) : (
                                            <>
                                                {fileData.map(file => {
                                                    const isCompleted = file.lines.every(l => l.status === 'reviewed');
                                                    const hasReviewed = file.lines.some(l => l.status === 'reviewed');
                                                    return (
                                                        <button 
                                                            key={file.id} 
                                                            onClick={() => { setActiveXmlFileId(file.id); setXmlCurrentPage(1); }} 
                                                            className={`w-full text-left p-2 rounded text-sm flex items-center gap-2 transition-colors ${
                                                                activeXmlFileId === file.id 
                                                                    ? 'bg-indigo-100 text-indigo-700 font-medium border border-indigo-200' 
                                                                    : 'hover:bg-slate-100 border border-transparent'
                                                            } ${isCompleted ? 'text-green-700 font-medium' : hasReviewed ? 'text-green-600' : 'text-slate-600'}`}
                                                        >
                                                            <TableIcon className={`w-4 h-4 flex-shrink-0 ${isCompleted ? 'text-green-500' : ''}`} />
                                                            <span className="truncate">{file.name}</span>
                                                            {isCompleted && <CheckIcon className="w-3 h-3 text-green-500 ml-auto" />}
                                                        </button>
                                                    );
                                                })}
                                                {fileData.length === 0 && <p className="text-xs text-slate-400 p-2 text-center italic">No hay XMLs cargados.</p>}
                                            </>
                                        )}
                                     </div>
                                </div>
                            )}
                            
                            {!isXmlSidebarOpen && (
                                <div className="absolute top-4 left-4 z-30">
                                    <button onClick={() => setIsXmlSidebarOpen(true)} className="bg-white p-2 rounded-full shadow-md border border-slate-200 hover:bg-slate-50"><ChevronRightIcon className="w-4 h-4 text-slate-600"/></button>
                                </div>
                            )}

                            {/* Main Viewer */}
                            <div className="flex-1 flex flex-col relative min-w-0">
                                {/* Toolbar */}
                                <div className="h-12 border-b border-slate-200 flex items-center justify-between px-4 bg-white flex-shrink-0">
                                    <div className="font-medium text-slate-700 truncate flex items-center gap-2 pl-8 md:pl-0">
                                        <TableIcon className="w-5 h-5 text-indigo-500"/>
                                        {activeXmlFile?.name || 'Selecciona un archivo'}
                                    </div>
                                    {activeXmlFile && (
                                        <div className="flex items-center gap-2">
                                             <button disabled={xmlCurrentPage === 1} onClick={() => setXmlCurrentPage(p => p - 1)} className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"><ChevronLeftIcon className="w-4 h-4"/></button>
                                             <span className="text-xs text-slate-600 font-medium">Pág {xmlCurrentPage} de {totalXmlPages}</span>
                                             <button disabled={xmlCurrentPage === totalXmlPages} onClick={() => setXmlCurrentPage(p => p + 1)} className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"><ChevronRightIcon className="w-4 h-4"/></button>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Lines Area */}
                                <div className="flex-1 overflow-auto bg-white p-0" id="xml-viewer">
                                    {activeXmlFile ? displayedXmlLines.map((line, idx) => (
                                        <LineComponent
                                            key={line.id}
                                            line={line}
                                            lineNumber={(xmlCurrentPage - 1) * ITEMS_PER_PAGE + idx + 1}
                                            isSelected={false} 
                                            isChecked={selectedXmlLines.has(line.id)}
                                            isHighlighted={line.id === highlightedLineId}
                                            isDuplicate={false}
                                            onContextMenu={(e, lineId) => { e.preventDefault(); handleOpenCommentModal(lineId, e.clientX, e.clientY); }}
                                            onSelect={() => {}}
                                            onToggleSelection={handleToggleXmlSelection}
                                            onUpdateContent={handleUpdateLineContent}
                                            onEditComment={(lineId) => handleOpenCommentModal(lineId)}
                                            onNavigateToDuplicate={() => {}}
                                            onNavigateToPdf={handleOpenPdfFromXml}
                                            onToggleStatus={(lineId) => activeXmlFileId && handleToggleLineStatus(activeXmlFileId, lineId)}
                                        />
                                    )) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                            <TableIcon className="w-16 h-16 mb-4 opacity-20" />
                                            <p>Selecciona un archivo XML para visualizar</p>
                                        </div>
                                    )}
                                </div>

                                {/* Floating Summation Footer */}
                                {xmlSelectionSummary && (
                                    <div className="absolute bottom-4 right-4 bg-indigo-900 text-white p-4 rounded-lg shadow-xl z-30 flex gap-6 items-center animate-fade-in-up opacity-95">
                                        <div className="flex items-center gap-3 border-r border-indigo-700 pr-4">
                                            <CalculatorIcon className="w-6 h-6 text-indigo-300" />
                                            <div>
                                                <p className="text-xs text-indigo-300 uppercase font-bold">Selección</p>
                                                <p className="font-mono font-bold">{xmlSelectionSummary.count} líneas</p>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs text-indigo-300 uppercase font-bold">Total VUSD</p>
                                            <p className="font-mono font-bold text-lg">{formatCurrency(xmlSelectionSummary.vusd)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-indigo-300 uppercase font-bold">Total VUSDI</p>
                                            <p className="font-mono font-bold text-lg">{formatCurrency(xmlSelectionSummary.vusdi)}</p>
                                        </div>
                                        <button onClick={() => setSelectedXmlLines(new Set())} className="ml-2 p-1 hover:bg-indigo-800 rounded text-indigo-300 hover:text-white"><CloseIcon className="w-4 h-4" /></button>
                                    </div>
                                )}
                             </div>
                        </div>
                    )}

                    {activeView === 'documents' && (
                        <div className="p-2 h-full">
                            <DeclarationReviewView 
                                declarations={auditFiles.declaraciones}
                                reviews={reviews}
                                processedDeclarations={processedDeclarations}
                                onUpdateReview={(updated) => {
                                    setReviews(prev => {
                                        const idx = prev.findIndex(r => r.fileId === updated.fileId);
                                        if (idx >= 0) {
                                            const next = [...prev];
                                            next[idx] = updated;
                                            return next;
                                        }
                                        return [...prev, updated];
                                    });

                                    // Sync comment to movements
                                    const meta = processedDeclarations.find(p => p.id === updated.fileId || p.fileName === updated.fileName);
                                    if (meta) {
                                        setMovements(prevMoves => prevMoves.map(m => {
                                            // Check if this movement is linked to this declaration
                                            const isLinked = m.linkedDeclarations?.some(l => l.targetFileName === updated.fileName);
                                            
                                            if (isLinked) {
                                                return {
                                                    ...m,
                                                    operations: m.operations.map(op => ({
                                                        ...op,
                                                        reviewData: {
                                                            ...op.reviewData,
                                                            comments: updated.auditorComments // Sync logic
                                                        }
                                                    }))
                                                };
                                            }
                                            return m;
                                        }));
                                    }
                                }}
                                currentUser={user.username}
                                focusFileId={selectedDeclarationId}
                                searchOnLoad={activePdfSearchTerm}
                                onFindXml={handleFindXmlOperation}
                                customComments={customComments}
                                onSaveCustomComment={handleSaveCustomComment}
                            />
                        </div>
                    )}

                    {activeView === 'dashboard' && (
                        <div className="p-2 h-full">
                            <AuditDashboard 
                                movements={movements}
                                reviews={reviews}
                                fileData={fileData}
                            />
                        </div>
                    )}
                </main>
            </div>

            {/* Modals */}
            {commentModalData && (
                <CommentModal
                    lineId={commentModalData.lineId}
                    position={commentModalData.position}
                    lineContent={commentModalData.lineContent}
                    existingComment={commentModalData.existingComment}
                    commentOptions={customComments} 
                    selectedCount={1}
                    onSave={handleSaveComment}
                    onDelete={handleDeleteComment}
                    onClose={() => setCommentModalData(null)}
                />
            )}
            {showRecovery && <SessionRecoveryModal username={user.username} onRecover={handleRecoverSession} onDiscard={handleDiscardSession} />}
            {showProgressLoaded && <ProgressLoadedModal onClose={() => setShowProgressLoaded(false)} />}
            {showUserManagement && <UserManagementModal onClose={() => setShowUserManagement(false)} />}
            {showUsageStats && <UsageStatsModal currentUser={user} onClose={() => setShowUsageStats(false)} />}
            {showAdminSession && <AdminSessionSelector currentViewingUser={user.username} onSelectUserSession={handleAdminSelectSession} onClose={() => setShowAdminSession(false)} />}
        </div>
    );
};

const SidebarItem = ({ icon, label, active, collapsed, onClick }: any) => (
    <button 
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'} ${collapsed ? 'justify-center' : ''}`}
        title={collapsed ? label : ''}
    >
        <span className="w-5 h-5">{icon}</span>
        {!collapsed && <span className="font-medium text-sm">{label}</span>}
    </button>
);

export default App;
