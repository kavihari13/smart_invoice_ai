"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Upload, FileIcon, ImageIcon, Trash2, Download, Eye, RefreshCw, Search } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { initializeApp } from "firebase/app"
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage"
import { getFirestore, collection, query, getDocs, limit } from "firebase/firestore"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Firebase configuration - replace with your config
const firebaseConfig = {
  apiKey: "AIzaSyAH5t3fmfkvSmSJyYxRSRolwl6VuScUiXI",
  authDomain: "smartinvoice-ai.firebaseapp.com",
  projectId: "smartinvoice-ai",
  storageBucket: "smartinvoice-ai.firebasestorage.app",
  messagingSenderId: "84062537714",
  appId: "1:84062537714:web:cd1103ff88f575f9c48d6b",
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const storage = getStorage(app)
const db = getFirestore(app)

interface UploadedFile {
  id: string
  name: string
  type: string
  size: number
  url: string
  uploadedAt: Date
}

interface ProcessedData {
  id: string
  fileName: string
  processedAt: Date
  status: string
  data: any
}

export default function AdminDashboard() {
  const [files, setFiles] = useState<File[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [processedData, setProcessedData] = useState<ProcessedData[]>([])
  const [fetchingData, setFetchingData] = useState(false)
  const [selectedJson, setSelectedJson] = useState<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    const validFiles = Array.from(selectedFiles).filter((file) => {
      const isValidType = file.type.startsWith("image/") || file.type === "application/pdf"
      const isValidSize = file.size <= 10 * 1024 * 1024 // 10MB limit

      if (!isValidType) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a valid image or PDF file.`,
          variant: "destructive",
        })
        return false
      }

      if (!isValidSize) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the 10MB limit.`,
          variant: "destructive",
        })
        return false
      }

      return true
    })

    setFiles((prev) => [...prev, ...validFiles])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFileSelect(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const fetchProcessedData = async (fileName?: string) => {
    setFetchingData(true)
    try {
      let q
      if (fileName) {
        // Query for specific file - search in all documents
        q = query(collection(db, "invoices"), limit(50))
      } else {
        // Get all documents from invoices collection
        q = query(collection(db, "invoices"), limit(50))
      }

      const querySnapshot = await getDocs(q)
      const data: ProcessedData[] = []

      querySnapshot.forEach((doc) => {
        const docData = doc.data()

        // If searching for specific file, filter by fileName
        if (fileName) {
          const docFileName = docData.fileName || docData.name || docData.originalName || ""
          if (!docFileName.toLowerCase().includes(fileName.toLowerCase())) {
            return // Skip this document
          }
        }

        data.push({
          id: doc.id, // This is the auto-generated document ID
          fileName: docData.fileName || docData.name || docData.originalName || `Document ${doc.id.substring(0, 8)}`,
          processedAt:
            docData.processedAt?.toDate() || docData.uploadedAt?.toDate() || docData.createdAt?.toDate() || new Date(),
          status: docData.status || docData.state || "processed",
          data: {
            documentId: doc.id,
            ...docData,
          },
        })
      })

      // Sort by processed date (newest first)
      data.sort((a, b) => b.processedAt.getTime() - a.processedAt.getTime())

      setProcessedData(data)

      if (fileName && data.length > 0) {
        setSelectedJson(data[0].data)
      }

      toast({
        title: "Data fetched",
        description: `Found ${data.length} document(s) in /invoices collection.`,
      })
    } catch (error) {
      console.error("Error fetching data:", error)
      toast({
        title: "Fetch failed",
        description: "Error fetching data from Firestore /invoices collection.",
        variant: "destructive",
      })
    } finally {
      setFetchingData(false)
    }
  }

  const uploadFiles = async () => {
    if (files.length === 0) return

    setUploading(true)
    setUploadProgress(0)

    try {
      const uploadPromises = files.map(async (file, index) => {
        const fileName = `invoices/${Date.now()}-${file.name}`
        const storageRef = ref(storage, fileName)

        return new Promise<UploadedFile>((resolve, reject) => {
          const uploadTask = uploadBytesResumable(storageRef, file)

          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              setUploadProgress((prev) => Math.max(prev, (progress / files.length) * (index + 1)))
            },
            (error) => {
              console.error("Upload error:", error)
              reject(error)
            },
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref)

                resolve({
                  id: Date.now().toString() + index,
                  name: file.name,
                  type: file.type,
                  size: file.size,
                  url: downloadURL,
                  uploadedAt: new Date(),
                })
              } catch (error) {
                reject(error)
              }
            },
          )
        })
      })

      const results = await Promise.all(uploadPromises)
      setUploadedFiles((prev) => [...prev, ...results])
      setFiles([])

      toast({
        title: "Upload successful",
        description: `${results.length} file(s) uploaded. Cloud Function will process them.`,
      })

      // Wait a moment then try to fetch processed data
      setTimeout(() => {
        fetchProcessedData()
      }, 3000)
    } catch (error) {
      console.error("Upload failed:", error)
      toast({
        title: "Upload failed",
        description: "There was an error uploading your files.",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const deleteFile = async (file: UploadedFile) => {
    try {
      const fileRef = ref(storage, file.url)
      await deleteObject(fileRef)

      setUploadedFiles((prev) => prev.filter((f) => f.id !== file.id))

      toast({
        title: "File deleted",
        description: `${file.name} has been deleted from Storage.`,
      })
    } catch (error) {
      console.error("Delete error:", error)
      toast({
        title: "Delete failed",
        description: "There was an error deleting the file.",
        variant: "destructive",
      })
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const extractInvoiceData = (data: any) => {
    // Try different possible field names for each property
    const invoiceNumber = data.invoiceNumber || data.invoice_number || data.number || data.invoiceNo || "N/A"
    const vendorName = data.vendorName || data.vendor_name || data.vendor || data.supplier || data.company || "N/A"
    const invoiceDate = data.invoiceDate || data.invoice_date || data.date || data.issueDate || "N/A"
    const totalAmount = data.totalAmount || data.total_amount || data.total || data.amount || data.grandTotal || "N/A"
    const status = data.status || data.state || data.processing_status || "processed"

    return {
      invoiceNumber,
      vendorName,
      invoiceDate,
      totalAmount,
      status,
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Smart Invoice and Data Extraction using Google AI</h1>
          <p className="text-muted-foreground">Upload files and view processed results from Cloud Functions</p>
        </div>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Invoice Files</CardTitle>
          <CardDescription>
            Upload images (JPG, PNG, GIF) or PDF files. Cloud Function will process them automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-muted-foreground/50 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Drop files here or click to browse</p>
            <p className="text-sm text-muted-foreground">Supports images and PDF files up to 10MB</p>
            <Input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <Label>Selected Files ({files.length})</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex items-center gap-2">
                      {file.type.startsWith("image/") ? (
                        <ImageIcon className="h-4 w-4" />
                      ) : (
                        <FileIcon className="h-4 w-4" />
                      )}
                      <span className="text-sm font-medium">{file.name}</span>
                      <Badge variant="secondary">{formatFileSize(file.size)}</Badge>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeFile(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Upload Progress</Label>
                <span className="text-sm text-muted-foreground">{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={uploadFiles} disabled={files.length === 0 || uploading} className="flex-1">
              {uploading ? "Uploading..." : `Upload ${files.length} File(s)`}
            </Button>
            {files.length > 0 && (
              <Button variant="outline" onClick={() => setFiles([])} disabled={uploading}>
                Clear All
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Processed Data Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Processed Invoice Data
            <Button variant="outline" size="sm" onClick={() => fetchProcessedData()} disabled={fetchingData}>
              {fetchingData ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>Invoice data extracted from processed files</CardDescription>
        </CardHeader>
        <CardContent>
          {processedData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="mx-auto h-12 w-12 mb-4" />
              <p>No processed data found</p>
              <Button variant="outline" onClick={() => fetchProcessedData()} className="mt-2">
                Fetch Data
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice Number</TableHead>
                    <TableHead>Vendor Name</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedData.map((item) => {
                    const invoiceData = extractInvoiceData(item.data)
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{invoiceData.invoiceNumber}</TableCell>
                        <TableCell>{invoiceData.vendorName}</TableCell>
                        <TableCell>{invoiceData.invoiceDate}</TableCell>
                        <TableCell>{invoiceData.totalAmount}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              invoiceData.status === "success" || invoiceData.status === "processed"
                                ? "default"
                                : "destructive"
                            }
                          >
                            {invoiceData.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedJson(item.data)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              {item.processedAt.toLocaleDateString()}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* JSON Viewer Section */}
      {selectedJson && (
        <Card>
          <CardHeader>
            <CardTitle>Full JSON Data</CardTitle>
            <CardDescription>Complete processed data from Cloud Function</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(selectedJson, null, 2))
                    toast({
                      title: "Copied to clipboard",
                      description: "JSON data copied to clipboard.",
                    })
                  }}
                >
                  Copy JSON
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedJson(null)}>
                  Close
                </Button>
              </div>
              <pre className="p-4 bg-slate-950 text-slate-50 rounded-lg text-xs overflow-x-auto max-h-96">
                {JSON.stringify(selectedJson, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Uploaded Files Section */}
      <Card>
        <CardHeader>
          <CardTitle>Uploaded Files ({uploadedFiles.length})</CardTitle>
          <CardDescription>Files uploaded to Firebase Storage</CardDescription>
        </CardHeader>
        <CardContent>
          {uploadedFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileIcon className="mx-auto h-12 w-12 mb-4" />
              <p>No files uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {uploadedFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {file.type.startsWith("image/") ? (
                      <ImageIcon className="h-5 w-5 text-blue-500" />
                    ) : (
                      <FileIcon className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <p className="font-medium">{file.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{formatFileSize(file.size)}</span>
                        <span>•</span>
                        <span>{file.uploadedAt.toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fetchProcessedData(file.name)}
                      disabled={fetchingData}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => window.open(file.url, "_blank")}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const link = document.createElement("a")
                        link.href = file.url
                        link.download = file.name
                        link.click()
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteFile(file)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
