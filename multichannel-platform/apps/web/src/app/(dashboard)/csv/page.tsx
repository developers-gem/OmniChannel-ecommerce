'use client';

import React, { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Download,
  ArrowRight,
  PackagePlus,
  RefreshCw,
  FileText,
  X,
  Layers,
  Check,
  Settings2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Save,
  Edit2,
  Trash2,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

interface ParsedProductItem {
  id: string;
  rowIndex: number;
  sku: string;
  title: string;
  brand: string;
  category: string;
  description: string;
  barcode?: string;
  costPrice: number;
  retailPrice: number;
  stock: number;
  images: string;
  tags?: string;
  raw?: any;
}

export default function CsvImportPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [csvContent, setCsvContent] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Parsed products list that can be edited row-by-row before pushing to database
  const [productsList, setProductsList] = useState<ParsedProductItem[]>([]);

  const [previewData, setPreviewData] = useState<{
    headers: string[];
    detectedMapping: Record<string, string>;
    totalRows: number;
    previewRows: any[];
    products?: ParsedProductItem[];
    duplicateSkus?: string[];
  } | null>(null);

  const [mappingConfig, setMappingConfig] = useState<Record<string, string>>({});
  const [showAdvancedMapping, setShowAdvancedMapping] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // "File Already Uploaded" confirmation modal state
  const [showAlreadyUploadedModal, setShowAlreadyUploadedModal] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Edit product details modal state
  const [editingItem, setEditingItem] = useState<ParsedProductItem | null>(null);
  const [editForm, setEditForm] = useState<{
    sku: string;
    title: string;
    brand: string;
    category: string;
    description: string;
    retailPrice: number;
    stock: number;
    images: string;
  }>({
    sku: '',
    title: '',
    brand: '',
    category: '',
    description: '',
    retailPrice: 0,
    stock: 0,
    images: '',
  });

  // Fetch job history
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['csv-jobs'],
    queryFn: async () => {
      const res: any = await api.get('/csv/jobs');
      return res.data;
    },
  });

  // Dynamically compute duplicate SKUs across productsList
  const duplicateSkuSet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of productsList) {
      const s = (p.sku || '').trim().toUpperCase();
      if (s) {
        counts.set(s, (counts.get(s) || 0) + 1);
      }
    }
    const duplicates = new Set<string>();
    counts.forEach((cnt, s) => {
      if (cnt > 1) duplicates.add(s);
    });
    return duplicates;
  }, [productsList]);

  // Preview mutation: analyzes headers & maps products from uploaded file
  const previewMutation = useMutation({
    mutationFn: async (content: string) => {
      const res: any = await api.post('/csv/preview', { csvContent: content });
      return res.data;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      if (data?.detectedMapping) {
        setMappingConfig(data.detectedMapping);
      }
      if (Array.isArray(data?.products)) {
        setProductsList(data.products);
      }
      setError(null);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to parse CSV file');
    },
  });

  // Import mutation: adds CSV products to canonical catalog using the edited productsList
  const importMutation = useMutation({
    mutationFn: async () => {
      if (productsList.length === 0) {
        throw new Error('No product records available to import. Please select a CSV file.');
      }
      const res: any = await api.post('/csv/import', {
        products: productsList,
        fileName: fileName || 'product-catalog-upload.csv',
        mappingConfig,
      });
      return res.data || res;
    },
    onSuccess: (data) => {
      const info = data?.data || data;
      setImportResult(info);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['csv-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      setError(err.message || 'CSV Import failed');
    },
  });

  const processSelectedFile = (selectedFile: File) => {
    setError(null);
    setImportResult(null);

    setFile(selectedFile);
    setFileName(selectedFile.name);
    setFileSize(formatFileSize(selectedFile.size));

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content || !content.trim()) {
        setError('Selected CSV file is empty. Please select a file with product records.');
        return;
      }
      setCsvContent(content);
      previewMutation.mutate(content);
    };
    reader.onerror = () => {
      setError('Could not read the selected file from your system.');
    };
    reader.readAsText(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.toLowerCase().endsWith('.csv') && selected.type !== 'text/csv') {
      setError('Please select a valid .csv file from your system.');
      return;
    }

    // Check if user has already uploaded this file before
    const isAlreadyUploaded = jobs?.some(
      (job: any) => job.fileName?.toLowerCase() === selected.name.toLowerCase()
    );

    if (isAlreadyUploaded) {
      setPendingFile(selected);
      setShowAlreadyUploadedModal(true);
    } else {
      processSelectedFile(selected);
    }
  };

  const handleConfirmReimport = () => {
    if (pendingFile) {
      processSelectedFile(pendingFile);
    }
    setShowAlreadyUploadedModal(false);
    setPendingFile(null);
  };

  const handleCancelReimport = () => {
    setShowAlreadyUploadedModal(false);
    setPendingFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;

    if (!droppedFile.name.toLowerCase().endsWith('.csv') && droppedFile.type !== 'text/csv') {
      setError('Please drop a valid .csv file.');
      return;
    }

    const isAlreadyUploaded = jobs?.some(
      (job: any) => job.fileName?.toLowerCase() === droppedFile.name.toLowerCase()
    );

    if (isAlreadyUploaded) {
      setPendingFile(droppedFile);
      setShowAlreadyUploadedModal(true);
    } else {
      processSelectedFile(droppedFile);
    }
  };

  const handleClearFile = () => {
    setFile(null);
    setFileName('');
    setFileSize('');
    setCsvContent('');
    setPreviewData(null);
    setProductsList([]);
    setMappingConfig({});
    setImportResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadSampleCsv = () => {
    const templateContent = `SKU,Title,Brand,Category,Description,CostPrice,RetailPrice,Stock,Barcode,Tags,Images
TECH-SAMPLE-01,Wireless Ergonomic Mouse,AcoustiQ,Electronics,Precision wireless mouse with silent optical clicks,15.00,39.99,100,850012345001,"electronics, wireless, mouse","https://images.unsplash.com/photo-1527864550417-7fd91fc51a46"
TECH-SAMPLE-02,Mechanical Gaming Keyboard,AcoustiQ,Electronics,RGB mechanical keyboard with red switches and durable keycaps,35.00,89.99,50,850012345002,"gaming, rgb, keyboard","https://images.unsplash.com/photo-1587829741301-dc798b83add3"
APP-TEE-SAMPLE,Classic Organic Cotton T-Shirt,Nordic Wear,Apparel,100% organic cotton breathable crewneck t-shirt,8.50,24.00,150,850012345003,"clothing, t-shirt, organic","https://images.unsplash.com/photo-1521572267360-ee0c2909d518"
APP-HOOD-SAMPLE,Heavyweight Pullover Hoodie,Nordic Wear,Apparel,Fleece-lined heavyweight hoodie with front kangaroo pocket,19.00,49.99,80,850012345004,"clothing, hoodie, fleece","https://images.unsplash.com/photo-1556905055-8f358a7a47b2"`;

    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sample-products-template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Open Edit Dialog for a row
  const handleOpenEdit = (product: ParsedProductItem) => {
    setEditingItem(product);
    setEditForm({
      sku: product.sku || '',
      title: product.title || '',
      brand: product.brand || '',
      category: product.category || '',
      description: product.description || '',
      retailPrice: product.retailPrice || 0,
      stock: product.stock || 0,
      images: product.images || '',
    });
  };

  // Save row modifications back to productsList
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setProductsList((prev) =>
      prev.map((item) =>
        item.id === editingItem.id
          ? {
              ...item,
              sku: editForm.sku.trim().toUpperCase(),
              title: editForm.title.trim(),
              brand: editForm.brand.trim() || 'Generic',
              category: editForm.category.trim() || 'General',
              description: editForm.description.trim(),
              retailPrice: Number(editForm.retailPrice) || 0,
              stock: Number(editForm.stock) || 0,
              images: editForm.images.trim(),
            }
          : item
      )
    );

    setEditingItem(null);
  };

  // Delete/remove a specific product row before importing
  const handleDeleteRow = (productId: string) => {
    setProductsList((prev) => prev.filter((item) => item.id !== productId));
  };

  return (
    <div className="space-y-6">
      {/* Header - ONLY Download Sample and Export buttons here (Single Save button is below table) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">CSV Product Import</h1>
          <p className="text-xs text-slate-400 mt-1">
            Upload your CSV file from your system to add all products, prices, images, and inventory into your master catalog
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadSampleCsv}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-700 transition cursor-pointer"
            title="Download a sample CSV template with all supported columns"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Download Sample CSV</span>
          </button>

          <button
            type="button"
            onClick={() => window.open('http://localhost:5050/api/v1/csv/export', '_blank')}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-brand-300 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-700 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-brand-400" />
            <span>Export Product Catalog</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/70 border border-red-800/80 flex items-center justify-between gap-3 text-red-200 text-xs shadow-lg animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-white text-xs px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Import Result / Success Notification */}
      {importResult && (
        <div className="bg-emerald-950/80 border border-emerald-800/90 rounded-2xl p-6 text-xs text-emerald-200 shadow-2xl animate-in fade-in duration-200 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">File imported successfully!</h3>
                <p className="text-xs text-emerald-300/95 mt-1 leading-relaxed">
                  {importResult.message || `Products have been added into your product list.`}
                </p>
              </div>
            </div>

            <Link
              href="/products"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition cursor-pointer shrink-0"
            >
              <span>View in All Products</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-slate-300 bg-slate-900/80 p-3.5 rounded-xl border border-emerald-900/50">
            <div>
              <span className="text-[10px] text-slate-400 uppercase block">Total Processed</span>
              <span className="text-sm font-bold text-white">{importResult.totalRows}</span>
            </div>
            <div>
              <span className="text-[10px] text-emerald-400 uppercase block">Added / Updated</span>
              <span className="text-sm font-bold text-emerald-400">{importResult.successfulRows}</span>
            </div>
            <div>
              <span className="text-[10px] text-brand-400 uppercase block">New Products</span>
              <span className="text-sm font-bold text-brand-300">{importResult.createdCount ?? importResult.successfulRows}</span>
            </div>
            <div>
              <span className="text-[10px] text-amber-400 uppercase block">Duplicates Skipped</span>
              <span className="text-sm font-bold text-amber-300">
                {importResult.skippedDuplicates ? importResult.skippedDuplicates.length : 0}
              </span>
            </div>
          </div>

          {importResult.skippedDuplicates && importResult.skippedDuplicates.length > 0 && (
            <div className="pt-3 border-t border-emerald-900/40 bg-amber-950/30 -mx-6 -mb-6 p-4 rounded-b-2xl border-t border-amber-900/40">
              <p className="text-xs font-bold text-amber-300 flex items-center gap-2 mb-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Duplicate SKU Product Notice:</span>
              </p>
              <div className="space-y-1.5 text-[11px] text-amber-200/90 leading-relaxed">
                {importResult.skippedDuplicates.map((dup: any, idx: number) => (
                  <p key={idx}>
                    • There were two products with SKU <code className="bg-amber-900/60 px-1 py-0.5 rounded font-mono font-bold text-white">{dup.sku}</code>:
                    {' '}&ldquo;{dup.firstTitle}&rdquo; (Row {dup.firstRow}) and &ldquo;{dup.title}&rdquo; (Row {dup.rowNumber}).
                    {' '}We have added only the first one (&ldquo;{dup.firstTitle}&rdquo;).
                  </p>
                ))}
                <p className="mt-2 text-[11px] text-slate-300 font-medium">
                  💡 If you want to add the skipped product: delete all products except that one and upload again, or update its SKU in the list above before saving, or add it manually via Add Product.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main File Ingestion Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Select CSV File from System
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Pick any CSV file from your computer containing product details. All fields (SKU, Title, Brand, Category, Prices, Stock, Images, Tags) will be automatically detected and mapped.
          </p>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="hidden"
          id="csv-file-input"
        />

        {/* Dropzone / Upload Box */}
        {!file ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition cursor-pointer flex flex-col items-center justify-center gap-3 ${
              isDragging
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-slate-700/80 hover:border-brand-500/60 bg-slate-950/60 hover:bg-slate-950'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400 shadow-inner">
              <UploadCloud className="w-7 h-7" />
            </div>

            <div>
              <p className="text-sm font-semibold text-white">
                Click to browse or drag & drop your CSV file here
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Supports standard CSV files from Excel, Shopify, Google Sheets, or custom catalogs
              </p>
            </div>

            <button
              type="button"
              className="mt-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-brand-600/30 transition pointer-events-none"
            >
              Browse File from Computer
            </button>
          </div>
        ) : (
          /* Selected File Info Card (Redundant Save Button Removed as Requested) */
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white break-all">{fileName}</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                    <span>{fileSize}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">
                      {productsList.length} product records ready
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                >
                  Change File
                </button>
                <button
                  type="button"
                  onClick={handleClearFile}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-800 transition cursor-pointer"
                  title="Remove selected file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Auto-detected Fields Summary */}
            {previewData && (
              <div className="pt-3 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Detected Fields in File:</span>
                  <span className="text-slate-400 text-[11px] font-mono">
                    {previewData.headers.length} columns found
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {previewData.headers.map((header) => (
                    <span
                      key={header}
                      className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/70 text-slate-300 font-mono text-[11px] flex items-center gap-1.5"
                    >
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>{header}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Complete Products Table - Matching User's Screenshot Structure */}
        {productsList.length > 0 && (
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  File Content Preview
                </h3>
                <span className="text-xs text-slate-500 font-normal">
                  (Showing all {productsList.length} items from CSV)
                </span>
                {duplicateSkuSet.size > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    <AlertTriangle className="w-3 h-3" />
                    {duplicateSkuSet.size} Duplicate SKU detected
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowAdvancedMapping(!showAdvancedMapping)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
              >
                <Settings2 className="w-3.5 h-3.5 text-slate-400" />
                <span>{showAdvancedMapping ? 'Hide Column Mapping' : 'Customize Column Mapping'}</span>
                {showAdvancedMapping ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {/* Optional Collapsible Column Mapping Override */}
            {showAdvancedMapping && previewData && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 animate-in fade-in duration-150 space-y-4">
                <p className="text-[11px] text-slate-400">
                  Headers are automatically detected. You can optionally customize which CSV column maps to each product field below:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {['sku', 'title', 'retailPrice', 'costPrice', 'stock', 'brand', 'category', 'barcode', 'description', 'images', 'tags'].map(
                    (field) => (
                      <div key={field}>
                        <label className="block text-[10px] font-semibold text-slate-400 uppercase">
                          {field}
                        </label>
                        <select
                          value={mappingConfig[field] || ''}
                          onChange={(e) =>
                            setMappingConfig({ ...mappingConfig, [field]: e.target.value })
                          }
                          className="mt-1 w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-[11px] outline-none"
                        >
                          <option value="">(Auto-detect)</option>
                          {previewData.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Duplicate SKU Guidance Banner */}
            {duplicateSkuSet.size > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 flex items-start gap-3 text-amber-200 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-300">
                    Duplicate SKU Warning: Some items have the exact same SKU ({Array.from(duplicateSkuSet).join(', ')})
                  </p>
                  <p className="text-[11px] text-amber-200/80">
                    Click the <strong className="text-white">Edit</strong> button on duplicate items to give them unique SKUs before pushing.
                    If left unchanged, only the first item with that SKU will be imported, and duplicates will be skipped.
                  </p>
                </div>
              </div>
            )}

            {/* Full Product List Table Matching User's Screenshot */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 shadow-inner">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-800/80 text-slate-300 uppercase text-[10px] font-bold border-b border-slate-800 tracking-wider">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">#</th>
                      <th className="py-3 px-3">SKU</th>
                      <th className="py-3 px-3">TITLE</th>
                      <th className="py-3 px-3">DESCRIPTION</th>
                      <th className="py-3 px-3">BRAND</th>
                      <th className="py-3 px-3">CATEGORY</th>
                      <th className="py-3 px-3">IMAGES</th>
                      <th className="py-3 px-3 text-right">PRICE</th>
                      <th className="py-3 px-3 text-right">QUANTITY</th>
                      <th className="py-3 px-3 text-center">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-sans">
                    {productsList.map((item, idx) => {
                      const isDuplicate = duplicateSkuSet.has((item.sku || '').toUpperCase());
                      return (
                        <tr
                          key={item.id || idx}
                          className={`hover:bg-slate-900/60 transition ${
                            isDuplicate ? 'bg-amber-950/20' : ''
                          }`}
                        >
                          {/* Row Number */}
                          <td className="py-2.5 px-3 text-center text-slate-500 font-mono text-xs">
                            {idx + 1}
                          </td>

                          {/* SKU */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-semibold text-white text-xs">
                                {item.sku || '(Missing SKU)'}
                              </span>
                              {isDuplicate && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0"
                                  title="Duplicate SKU! Click Edit to change or only the first one will be added."
                                >
                                  ⚠️ Duplicate
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Title */}
                          <td className="py-2.5 px-3 text-slate-200 font-medium max-w-[160px] truncate" title={item.title}>
                            {item.title || '-'}
                          </td>

                          {/* Description */}
                          <td className="py-2.5 px-3 text-slate-400 text-xs max-w-[200px] truncate" title={item.description}>
                            {item.description || '-'}
                          </td>

                          {/* Brand */}
                          <td className="py-2.5 px-3 text-slate-300 max-w-[120px] truncate">
                            {item.brand || 'Generic'}
                          </td>

                          {/* Category */}
                          <td className="py-2.5 px-3 text-slate-300 max-w-[120px] truncate">
                            {item.category || 'General'}
                          </td>

                          {/* Images */}
                          <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px] max-w-[180px] truncate" title={item.images}>
                            {item.images || '-'}
                          </td>

                          {/* Price */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-white text-xs">
                            {item.retailPrice !== undefined ? `$${Number(item.retailPrice).toFixed(2)}` : '$0.00'}
                          </td>

                          {/* Quantity */}
                          <td className="py-2.5 px-3 text-right font-mono text-slate-200 text-xs">
                            {item.stock ?? 0}
                          </td>

                          {/* Actions: Edit & Delete */}
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(item)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 text-[11px] font-semibold transition cursor-pointer"
                                title="Modify SKU, price, or details before saving"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(item.id)}
                                className="p-1 rounded-lg bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-800 transition cursor-pointer"
                                title="Remove this product from import list"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ONLY ONE Single Prominent Save Button on Entire Page */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
              <div>
                <p className="text-xs sm:text-sm text-slate-300 font-medium">
                  Ready to import <span className="text-emerald-400 font-bold">{productsList.length} products</span> from <span className="text-white font-mono">{fileName}</span> into your Master Catalog.
                </p>
                {duplicateSkuSet.size > 0 ? (
                  <p className="text-xs text-amber-400 mt-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Notice: {duplicateSkuSet.size} duplicate SKU detected ({Array.from(duplicateSkuSet).join(', ')}). If not updated, only the first occurrence will be added.
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 mt-0.5">
                    All SKUs are ready and valid for import into your Master Catalog.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending || productsList.length === 0}
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold px-8 py-3.5 rounded-xl shadow-lg shadow-emerald-600/30 transition disabled:opacity-50 cursor-pointer shrink-0"
              >
                {importMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving All Changes to Catalog...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save All Changes in One Time</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Product Details Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-brand-400" />
                  <span>Update Product Details</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Row #{editingItem.rowIndex} in CSV import list
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  SKU (Unique Identifier) *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.sku}
                  onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                  placeholder="e.g. SKU-KLH003"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-brand-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Change this SKU if it conflicts with another product in this CSV or platform.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="Product name"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.retailPrice}
                    onChange={(e) => setEditForm({ ...editForm, retailPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Quantity (Stock)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.stock}
                    onChange={(e) => setEditForm({ ...editForm, stock: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Brand
                  </label>
                  <input
                    type="text"
                    value={editForm.brand}
                    onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                    placeholder="Brand name"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    placeholder="Category"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Product description"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Image URLs (comma-separated)
                </label>
                <input
                  type="text"
                  value={editForm.images}
                  onChange={(e) => setEditForm({ ...editForm, images: e.target.value })}
                  placeholder="https://example.com/img1.jpg, https://example.com/img2.jpg"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-lg shadow-brand-600/30 transition cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Apply Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* "File Already Uploaded" Confirmation Warning Modal */}
      {showAlreadyUploadedModal && pendingFile && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-800/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">File Already Uploaded</h3>
                <p className="text-xs text-slate-400 mt-0.5">Previous upload detected</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 space-y-1.5">
              <p>
                You have already uploaded this file (<span className="font-mono text-amber-300 font-bold">{pendingFile.name}</span>) previously.
              </p>
              <p className="text-slate-400 text-[11px]">
                Do you want to import it again? Any duplicate SKU products will either update existing records or follow your deduplication preference.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancelReimport}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReimport}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-600/30 transition cursor-pointer"
              >
                Yes, Import Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Job History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
            Import Job History
          </h2>
          <span className="text-xs text-slate-400">Recent CSV batch operations</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Filename</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Total Rows</th>
                <th className="py-3 px-4 text-center">Success</th>
                <th className="py-3 px-4 text-center">Failed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {jobsLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Loading jobs history...
                  </td>
                </tr>
              ) : jobs && jobs.length > 0 ? (
                jobs.map((job: any) => (
                  <tr key={job._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-200">{job.fileName}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          job.status === 'COMPLETED'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : 'bg-red-950 text-red-400 border border-red-800/60'
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono">{job.totalRows}</td>
                    <td className="py-3.5 px-4 text-center font-mono text-emerald-400 font-bold">
                      {job.successfulRows}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-red-400 font-bold">
                      {job.failedRows}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No import jobs run yet. Upload a CSV file above to import products.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
