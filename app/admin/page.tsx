"use client"

import type React from "react"
import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Upload, FileIcon, ImageIcon, Trash2, Download, Eye, AlertTriangle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { initializeApp } from "firebase/app"
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage"
import Link from "next/link"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

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

interface ValidationError {
  fileName: string
  issues: string[]
}

export default function AdminDashboard() {
  const [files, setFiles] = useState<File[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [validationError, setValidationError] = useState<ValidationError | null>(null)
  const [showValidationDialog, setShowValidationDialog] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const [currentValidatingFile, setCurrentValidatingFile] = useState<File | null>(null)

  const validateImage = (file: File): Promise<string[]> => {
    return new Promise((resolve) => {
      const issues: string[] = []
      const img = new Image()
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        console.error("Canvas context not available")
        resolve(["Unable to process image for validation"])
        return
      }

      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)

        try {
          console.log(`🔍 VALIDATING IMAGE: ${file.name}`)
          console.log(`📐 Image dimensions: ${img.width}x${img.height}`)
          console.log(`📁 File size: ${(file.size / 1024 / 1024).toFixed(2)}MB`)

          // 1. Check image dimensions - very lenient now
          if (img.width < 100 || img.height < 100) {
            console.log(`❌ Resolution check failed: ${img.width}x${img.height}`)
            issues.push("Image resolution is too low (minimum 100x100 pixels recommended)")
          } else {
            console.log("✅ Resolution check passed")
          }

          // 2. Enhanced blur detection with detailed logging
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const data = imageData.data
          const width = canvas.width
          const height = canvas.height
          let edgeSum = 0
          let edgeCount = 0

          // Sample pixels for edge detection
          const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 50)) // Adaptive sampling
          console.log(`🔬 Using sample step: ${sampleStep}`)

          for (let y = sampleStep; y < height - sampleStep; y += sampleStep) {
            for (let x = sampleStep; x < width - sampleStep; x += sampleStep) {
              const centerIndex = (y * width + x) * 4
              const rightIndex = (y * width + (x + sampleStep)) * 4
              const bottomIndex = ((y + sampleStep) * width + x) * 4

              if (rightIndex < data.length && bottomIndex < data.length) {
                const centerGray =
                  0.299 * data[centerIndex] + 0.587 * data[centerIndex + 1] + 0.114 * data[centerIndex + 2]
                const rightGray = 0.299 * data[rightIndex] + 0.587 * data[rightIndex + 1] + 0.114 * data[rightIndex + 2]
                const bottomGray =
                  0.299 * data[bottomIndex] + 0.587 * data[bottomIndex + 1] + 0.114 * data[bottomIndex + 2]

                const edgeStrength = Math.abs(centerGray - rightGray) + Math.abs(centerGray - bottomGray)
                edgeSum += edgeStrength
                edgeCount++
              }
            }
          }

          const averageEdgeStrength = edgeCount > 0 ? edgeSum / edgeCount : 0
          console.log(`📊 Edge strength: ${averageEdgeStrength.toFixed(2)} (sampled ${edgeCount} points)`)

          // Very lenient blur threshold - only flag extremely blurry images
          const blurThreshold = 3 // Even more lenient
          if (averageEdgeStrength < blurThreshold) {
            console.log(`❌ Blur check failed (${averageEdgeStrength.toFixed(2)} < ${blurThreshold})`)
            issues.push(`Image appears to be extremely blurry (edge strength: ${averageEdgeStrength.toFixed(2)})`)
          } else {
            console.log(`✅ Blur check passed (${averageEdgeStrength.toFixed(2)} >= ${blurThreshold})`)
          }

          // 3. Enhanced glare detection
          let overexposedPixels = 0
          let totalContentPixels = 0
          let brightPixelSum = 0

          // Sample every 16th pixel for performance
          for (let i = 0; i < data.length; i += 64) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b

            // Only consider pixels that aren't pure white background
            if (luminance < 245) {
              totalContentPixels++
              brightPixelSum += luminance

              // Very strict criteria for overexposure
              if (r >= 253 && g >= 253 && b >= 253) {
                overexposedPixels++
              }
            }
          }

          const overexposurePercentage = totalContentPixels > 0 ? (overexposedPixels / totalContentPixels) * 100 : 0
          const averageBrightness = totalContentPixels > 0 ? brightPixelSum / totalContentPixels : 0

          console.log(
            `💡 Overexposure: ${overexposurePercentage.toFixed(1)}% (${overexposedPixels}/${totalContentPixels} content pixels)`,
          )
          console.log(`🌟 Average content brightness: ${averageBrightness.toFixed(1)}`)

          // Very lenient glare threshold
          const glareThreshold = 60 // Even more lenient
          if (overexposurePercentage > glareThreshold) {
            console.log(`❌ Glare check failed (${overexposurePercentage.toFixed(1)}% > ${glareThreshold}%)`)
            issues.push(`Image has excessive glare (${overexposurePercentage.toFixed(1)}% overexposed)`)
          } else {
            console.log(`✅ Glare check passed (${overexposurePercentage.toFixed(1)}% <= ${glareThreshold}%)`)
          }

          // 4. Check for very dark images - more lenient
          const darknessThreshold = 15 // Even more lenient
          if (averageBrightness < darknessThreshold && totalContentPixels > 0) {
            console.log(`❌ Darkness check failed (${averageBrightness.toFixed(1)} < ${darknessThreshold})`)
            issues.push(`Image is too dark (brightness: ${averageBrightness.toFixed(1)})`)
          } else {
            console.log(`✅ Darkness check passed (${averageBrightness.toFixed(1)} >= ${darknessThreshold})`)
          }

          console.log(`🏁 Validation complete for ${file.name}`)
          console.log(`📋 Issues found: ${issues.length}`)
          if (issues.length > 0) {
            console.log("❗ Issues:", issues)
          } else {
            console.log("🎉 Image passed all validation checks!")
          }

          resolve(issues)
        } catch (error) {
          console.error("💥 Error during image validation:", error)
          resolve(["Error occurred during image validation"])
        }
      }

      img.onerror = () => {
        console.error("💥 Failed to load image for validation:", file.name)
        resolve(["Unable to load image for validation"])
      }

      img.crossOrigin = "anonymous"
      img.src = URL.createObjectURL(file)
    })
  }

  const handleFileSelect = async (selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    const validFiles: File[] = []
    const validationErrors: ValidationError[] = []

    for (const file of Array.from(selectedFiles)) {
      const isValidType = file.type.startsWith("image/") || file.type === "application/pdf"
      const isValidSize = file.size <= 10 * 1024 * 1024 // 10MB limit

      if (!isValidType) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a valid image or PDF file.`,
          variant: "destructive",
        })
        continue
      }

      if (!isValidSize) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the 10MB limit.`,
          variant: "destructive",
        })
        continue
      }

      // Validate images for blur and glare
      if (file.type.startsWith("image/")) {
        const issues = await validateImage(file)
        if (issues.length > 0) {
          setCurrentValidatingFile(file) // Store the file reference
          validationErrors.push({
            fileName: file.name,
            issues: issues,
          })
          continue
        }
      }

      validFiles.push(file)
    }

    // Show validation errors if any, but allow user to skip
    if (validationErrors.length > 0) {
      setValidationError(validationErrors[0]) // Show first error
      setShowValidationDialog(true)
      return
    }

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
            Upload images (JPG, PNG, GIF) or PDF files. Images will be validated for quality before upload.
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
            <p className="text-xs text-muted-foreground mt-1">
              Images will be automatically validated for blur and glare
            </p>
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
                      {file.type.startsWith("image/") && (
                        <Badge variant="outline" className="text-xs">
                          ✓ Validated
                        </Badge>
                      )}
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

      {/* Image Validation Error Dialog */}
      <AlertDialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Image Quality Issue Detected
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                The following issues were detected with <strong>{validationError?.fileName}</strong>:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {validationError?.issues.map((issue, index) => (
                  <li key={index} className="text-destructive">
                    {issue}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground mt-3">
                Please retake the photo with better lighting and focus for optimal AI processing results.
              </p>
              <p className="text-sm font-medium mt-3">
                If you believe this is a false positive, you can skip validation and upload anyway.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setValidationError(null)
                setCurrentValidatingFile(null)
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              onClick={() => {
                // Skip validation and add the file anyway
                if (currentValidatingFile) {
                  setFiles((prev) => [...prev, currentValidatingFile])
                }
                setShowValidationDialog(false)
                setValidationError(null)
                setCurrentValidatingFile(null)
              }}
            >
              Skip Validation & Upload
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                setShowValidationDialog(false)
                setValidationError(null)
                setCurrentValidatingFile(null)
              }}
            >
              Try Again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
