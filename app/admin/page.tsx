"use client"

import type React from "react"
import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Upload, FileIcon, ImageIcon, Trash2, Download, Eye } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { initializeApp } from "firebase/app"
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage"
import Link from "next/link"

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

interface UploadedFile {
  id: string
  name: string
  type: string
  size: number
  url: string
  uploadedAt: Date
}

export default function AdminDashboard() {
  const [files, setFiles] = useState<File[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Smart Invoice Upload Dashboard</h1>
          <p className="text-muted-foreground">Upload invoice files for AI processing</p>
        </div>
        <Link href="/admin/processed">
          <Button variant="outline">View Processed Data</Button>
        </Link>
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

      {/* Upload Status Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Status</CardTitle>
          <CardDescription>Recently uploaded files and their processing status</CardDescription>
        </CardHeader>
        <CardContent>
          {uploadedFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileIcon className="mx-auto h-12 w-12 mb-4" />
              <p>No files uploaded yet</p>
              <p className="text-sm">Upload files above to see them here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {uploadedFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
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
                        <span>Uploaded {file.uploadedAt.toLocaleDateString()}</span>
                        <span>•</span>
                        <Badge variant="outline" className="text-xs">
                          Processing...
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
              <div className="text-center pt-4">
                <Link href="/admin/processed">
                  <Button>View Processed Results →</Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
