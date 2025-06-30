"use client"

import React from "react"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  RefreshCw,
  Search,
  CheckCircle,
  XCircle,
  Eye,
  ArrowLeft,
  Check,
  X,
  Filter,
  Calendar,
  Trash2,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { initializeApp } from "firebase/app"
import { getFirestore, collection, query, getDocs, limit, doc, updateDoc, deleteDoc } from "firebase/firestore"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { format } from "date-fns"
import Link from "next/link"
import { getStorage, ref, getDownloadURL } from "firebase/storage"
import {
  AlertDialog,
  AlertDialogAction,
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
const db = getFirestore(app)
const storage = getStorage(app)

interface ProcessedData {
  id: string
  fileName: string
  processedAt: Date
  status: string
  data: any
}

interface FilterState {
  status: string
  validation: string
  search: string
  dateRange: {
    from: Date | undefined
    to: Date | undefined
  }
}

interface ImageValidationError {
  fileName: string
  issues: string[]
}

export default function ProcessedDataPage() {
  const [processedData, setProcessedData] = useState<ProcessedData[]>([])
  const [filteredData, setFilteredData] = useState<ProcessedData[]>([])
  const [fetchingData, setFetchingData] = useState(false)
  const [selectedJson, setSelectedJson] = useState<any>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    status: "all",
    validation: "all",
    search: "",
    dateRange: {
      from: undefined,
      to: undefined,
    },
  })
  const { toast } = useToast()
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [validationError, setValidationError] = useState<ImageValidationError | null>(null)

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
      // Apply filters to the new data
      applyFilters(data, filters)

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

  const applyFilters = (data: ProcessedData[], filterState: FilterState) => {
    let filtered = [...data]

    // Filter by status
    if (filterState.status !== "all") {
      filtered = filtered.filter((item) => {
        const status = item.status.toLowerCase()
        switch (filterState.status) {
          case "approved":
            return status === "approved"
          case "rejected":
            return status === "rejected"
          case "pending":
            return status === "processed" || status === "pending"
          default:
            return true
        }
      })
    }

    // Filter by validation
    if (filterState.validation !== "all") {
      filtered = filtered.filter((item) => {
        const validation = validateInvoiceTotal(item.data)
        return filterState.validation === "valid" ? validation.isValid : !validation.isValid
      })
    }

    // Filter by date range
    if (filterState.dateRange.from || filterState.dateRange.to) {
      filtered = filtered.filter((item) => {
        const itemDate = item.processedAt
        const fromDate = filterState.dateRange.from
        const toDate = filterState.dateRange.to

        // If only 'from' date is set
        if (fromDate && !toDate) {
          return itemDate >= fromDate
        }

        // If only 'to' date is set
        if (!fromDate && toDate) {
          // Set to end of day for 'to' date
          const endOfToDate = new Date(toDate)
          endOfToDate.setHours(23, 59, 59, 999)
          return itemDate <= endOfToDate
        }

        // If both dates are set
        if (fromDate && toDate) {
          const endOfToDate = new Date(toDate)
          endOfToDate.setHours(23, 59, 59, 999)
          return itemDate >= fromDate && itemDate <= endOfToDate
        }

        return true
      })
    }

    // Filter by search term
    if (filterState.search.trim()) {
      const searchTerm = filterState.search.toLowerCase()
      filtered = filtered.filter((item) => {
        const invoiceData = extractInvoiceData(item.data)
        return (
          invoiceData.invoiceNumber.toLowerCase().includes(searchTerm) ||
          invoiceData.vendorName.toLowerCase().includes(searchTerm) ||
          item.fileName.toLowerCase().includes(searchTerm)
        )
      })
    }

    setFilteredData(filtered)
  }

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    applyFilters(processedData, newFilters)
  }

  const handleDateRangeChange = (field: "from" | "to", date: Date | undefined) => {
    const newDateRange = { ...filters.dateRange, [field]: date }
    const newFilters = { ...filters, dateRange: newDateRange }
    setFilters(newFilters)
    applyFilters(processedData, newFilters)
  }

  const clearFilters = () => {
    const clearedFilters = {
      status: "all",
      validation: "all",
      search: "",
      dateRange: { from: undefined, to: undefined },
    }
    setFilters(clearedFilters)
    applyFilters(processedData, clearedFilters)
  }

  const clearDateRange = () => {
    handleFilterChange("dateRange", { from: undefined, to: undefined })
  }

  // Quick date range presets
  const setDateRangePreset = (preset: string) => {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    let from: Date | undefined
    let to: Date | undefined

    switch (preset) {
      case "today":
        from = startOfToday
        to = today
        break
      case "yesterday":
        const yesterday = new Date(startOfToday)
        yesterday.setDate(yesterday.getDate() - 1)
        from = yesterday
        to = yesterday
        break
      case "last7days":
        from = new Date(startOfToday)
        from.setDate(from.getDate() - 7)
        to = today
        break
      case "last30days":
        from = new Date(startOfToday)
        from.setDate(from.getDate() - 30)
        to = today
        break
      case "thisMonth":
        from = new Date(today.getFullYear(), today.getMonth(), 1)
        to = today
        break
      case "lastMonth":
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
        from = lastMonth
        to = lastDayOfLastMonth
        break
    }

    if (from || to) {
      handleFilterChange("dateRange", { from, to })
    }
  }

  const updateInvoiceStatus = async (documentId: string, newStatus: "approved" | "rejected") => {
    setUpdatingStatus(documentId)
    try {
      const docRef = doc(db, "invoices", documentId)
      await updateDoc(docRef, {
        status: newStatus,
        reviewedAt: new Date(),
        reviewedBy: "admin", // You can replace this with actual user info
      })

      // Update local state
      const updatedData = processedData.map((item) =>
        item.id === documentId
          ? {
              ...item,
              status: newStatus,
              data: {
                ...item.data,
                status: newStatus,
                reviewedAt: new Date(),
                reviewedBy: "admin",
              },
            }
          : item,
      )

      setProcessedData(updatedData)
      // Reapply filters to updated data
      applyFilters(updatedData, filters)

      toast({
        title: `Invoice ${newStatus}`,
        description: `Invoice has been ${newStatus} successfully.`,
      })
    } catch (error) {
      console.error("Error updating status:", error)
      toast({
        title: "Update failed",
        description: `Failed to ${newStatus === "approved" ? "approve" : "reject"} the invoice.`,
        variant: "destructive",
      })
    } finally {
      setUpdatingStatus(null)
    }
  }

  const deleteInvoice = async (documentId: string, fileName: string) => {
    setUpdatingStatus(documentId)
    try {
      const docRef = doc(db, "invoices", documentId)
      await deleteDoc(docRef)

      // Update local state
      const updatedData = processedData.filter((item) => item.id !== documentId)
      setProcessedData(updatedData)
      // Reapply filters to updated data
      applyFilters(updatedData, filters)

      toast({
        title: "Invoice deleted",
        description: `${fileName} has been deleted successfully.`,
      })
    } catch (error) {
      console.error("Error deleting invoice:", error)
      toast({
        title: "Delete failed",
        description: "Failed to delete the invoice.",
        variant: "destructive",
      })
    } finally {
      setUpdatingStatus(null)
    }
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

  const validateInvoiceTotal = (data: any) => {
    const items = data.items || []
    const totalAmount = data.totalAmount || data.total_amount || data.total || data.amount || data.grandTotal || 0
    const gstAmount = data.gstAmount || data.gst_amount || data.gst || data.tax || data.taxAmount || 0

    if (items.length === 0) {
      return {
        isValid: false,
        message: "No items found",
        itemsTotal: 0,
        gstAmount: Number.parseFloat(gstAmount.toString()) || 0,
        invoiceTotal: Number.parseFloat(totalAmount.toString()) || 0,
        calculatedTotal: 0,
        difference: 0,
      }
    }

    // Calculate sum of all item totals (before GST)
    const itemsTotal = items.reduce((sum: number, item: any) => {
      const itemTotal = Number.parseFloat(item.total || item.amount || "0")
      return sum + itemTotal
    }, 0)

    const parsedGstAmount = Number.parseFloat(gstAmount.toString()) || 0
    const invoiceTotal = Number.parseFloat(totalAmount.toString()) || 0

    // Calculate expected total (items + GST)
    const calculatedTotal = itemsTotal + parsedGstAmount
    const difference = Math.abs(calculatedTotal - invoiceTotal)

    // Consider valid if difference is less than 0.01 (to handle floating point precision)
    const isValid = difference < 0.01

    return {
      isValid,
      message: isValid ? "Valid" : `Mismatch: ₹${difference.toFixed(2)}`,
      itemsTotal,
      gstAmount: parsedGstAmount,
      invoiceTotal,
      calculatedTotal,
      difference,
    }
  }

  const toggleRowExpansion = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  const formatCurrency = (amount: string | number) => {
    if (!amount || amount === "N/A") return "N/A"
    const numAmount = typeof amount === "string" ? Number.parseFloat(amount) : amount
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(numAmount)
  }

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "approved":
        return <Badge className="bg-green-500 hover:bg-green-600">Approved</Badge>
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>
      case "processed":
        return <Badge variant="secondary">Pending Review</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // Calculate statistics based on filtered data
  const getFilteredStats = () => {
    const total = filteredData.length
    const approved = filteredData.filter((item) => item.status === "approved").length
    const rejected = filteredData.filter((item) => item.status === "rejected").length
    const pending = filteredData.filter((item) => item.status === "processed" || item.status === "pending").length
    const valid = filteredData.filter((item) => validateInvoiceTotal(item.data).isValid).length
    const invalid = filteredData.filter((item) => !validateInvoiceTotal(item.data).isValid).length
    const totalValue = filteredData.reduce((sum, item) => {
      const invoiceData = extractInvoiceData(item.data)
      const amount = Number.parseFloat(invoiceData.totalAmount.toString()) || 0
      return sum + amount
    }, 0)

    return { total, approved, rejected, pending, valid, invalid, totalValue }
  }

  const stats = getFilteredStats()

  const getFirebaseDownloadUrl = async (gsUrl: string): Promise<string> => {
    try {
      // Extract the path from gs:// URL
      const path = gsUrl.replace("gs://smartinvoice-ai.firebasestorage.app/", "")
      const storageRef = ref(storage, path)
      const downloadUrl = await getDownloadURL(storageRef)
      return downloadUrl
    } catch (error) {
      console.error("Error getting download URL:", error)
      throw error
    }
  }

  // Image validation functions
  const detectBlur = (canvas: HTMLCanvasElement): boolean => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return false

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    // Convert to grayscale and calculate variance
    let sum = 0
    let sumSquared = 0
    const pixelCount = data.length / 4

    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      sum += gray
      sumSquared += gray * gray
    }

    const mean = sum / pixelCount
    const variance = sumSquared / pixelCount - mean * mean

    // Low variance indicates blur
    return variance < 1000
  }

  const detectGlare = (canvas: HTMLCanvasElement): boolean => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return false

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    let overexposedPixels = 0
    const totalPixels = data.length / 4

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // Check if pixel is overexposed (very bright)
      if (r > 240 && g > 240 && b > 240) {
        overexposedPixels++
      }
    }

    const overexposurePercentage = (overexposedPixels / totalPixels) * 100

    // More than 15% overexposed pixels indicates glare
    return overexposurePercentage > 15
  }

  const validateImage = async (file: File): Promise<{ isValid: boolean; issues: string[] }> => {
    return new Promise((resolve) => {
      const img = new Image()
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        resolve({ isValid: false, issues: ["Unable to process image"] })
        return
      }

      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)

        const issues: string[] = []

        // Check for blur
        if (detectBlur(canvas)) {
          issues.push("Image appears to be blurry or out of focus")
        }

        // Check for glare
        if (detectGlare(canvas)) {
          issues.push("Image has excessive glare or overexposure")
        }

        resolve({
          isValid: issues.length === 0,
          issues,
        })
      }

      img.onerror = () => {
        resolve({ isValid: false, issues: ["Unable to load image for validation"] })
      }

      img.src = URL.createObjectURL(file)
    })
  }

  // Auto-fetch data on component mount
  React.useEffect(() => {
    fetchProcessedData()
  }, [])

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Upload
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Processed Invoice Data</h1>
            <p className="text-muted-foreground">View and analyze processed invoice results</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchProcessedData()} disabled={fetchingData}>
          {fetchingData ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Filter Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
          <CardDescription>Filter invoices by status, validation, date range, or search terms</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status-filter">Status</Label>
              <Select value={filters.status} onValueChange={(value) => handleFilterChange("status", value)}>
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="validation-filter">Validation</Label>
              <Select value={filters.validation} onValueChange={(value) => handleFilterChange("validation", value)}>
                <SelectTrigger id="validation-filter">
                  <SelectValue placeholder="All Validations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Validations</SelectItem>
                  <SelectItem value="valid">Valid Invoices</SelectItem>
                  <SelectItem value="invalid">Invalid Invoices</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="search-filter">Search</Label>
              <Input
                id="search-filter"
                placeholder="Invoice number, vendor..."
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Date Range</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start text-left font-normal bg-transparent">
                      <Calendar className="mr-2 h-4 w-4" />
                      {filters.dateRange.from ? format(filters.dateRange.from, "MMM dd") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={filters.dateRange.from}
                      onSelect={(date) => handleDateRangeChange("from", date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start text-left font-normal bg-transparent">
                      <Calendar className="mr-2 h-4 w-4" />
                      {filters.dateRange.to ? format(filters.dateRange.to, "MMM dd") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={filters.dateRange.to}
                      onSelect={(date) => handleDateRangeChange("to", date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <div className="flex gap-2">
                <Button variant="outline" onClick={clearFilters} className="flex-1 bg-transparent">
                  Clear All
                </Button>
                <Badge variant="secondary" className="px-3 py-1">
                  {stats.total} results
                </Badge>
              </div>
            </div>
          </div>

          {/* Date Range Presets */}
          <div className="mt-4 space-y-2">
            <Label className="text-sm text-muted-foreground">Quick Date Ranges:</Label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setDateRangePreset("today")}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDateRangePreset("yesterday")}>
                Yesterday
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDateRangePreset("last7days")}>
                Last 7 Days
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDateRangePreset("last30days")}>
                Last 30 Days
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDateRangePreset("thisMonth")}>
                This Month
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDateRangePreset("lastMonth")}>
                Last Month
              </Button>
              {(filters.dateRange.from || filters.dateRange.to) && (
                <Button variant="ghost" size="sm" onClick={clearDateRange}>
                  <X className="h-4 w-4 mr-1" />
                  Clear Dates
                </Button>
              )}
            </div>
          </div>

          {/* Active Filters Display */}
          {(filters.status !== "all" ||
            filters.validation !== "all" ||
            filters.search.trim() ||
            filters.dateRange.from ||
            filters.dateRange.to) && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {filters.status !== "all" && (
                <Badge variant="outline" className="gap-1">
                  Status: {filters.status}
                  <button
                    onClick={() => handleFilterChange("status", "all")}
                    className="ml-1 hover:bg-muted rounded-full"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filters.validation !== "all" && (
                <Badge variant="outline" className="gap-1">
                  Validation: {filters.validation}
                  <button
                    onClick={() => handleFilterChange("validation", "all")}
                    className="ml-1 hover:bg-muted rounded-full"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filters.search.trim() && (
                <Badge variant="outline" className="gap-1">
                  Search: "{filters.search}"
                  <button onClick={() => handleFilterChange("search", "")} className="ml-1 hover:bg-muted rounded-full">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {(filters.dateRange.from || filters.dateRange.to) && (
                <Badge variant="outline" className="gap-1">
                  Date: {filters.dateRange.from ? format(filters.dateRange.from, "MMM dd") : "Start"} -{" "}
                  {filters.dateRange.to ? format(filters.dateRange.to, "MMM dd") : "End"}
                  <button onClick={clearDateRange} className="ml-1 hover:bg-muted rounded-full">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics Cards - Updated to show filtered results */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">of {processedData.length} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Valid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.valid}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Invalid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.invalid}</div>
          </CardContent>
        </Card>
      </div>

      {/* Processed Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Processing Results</CardTitle>
          <CardDescription>Detailed view of filtered invoices with validation and approval actions</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="mx-auto h-12 w-12 mb-4" />
              <p>No invoices match the current filters</p>
              <Button variant="outline" onClick={clearFilters} className="mt-2 bg-transparent">
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Invoice Number</TableHead>
                    <TableHead>Vendor Name</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Validation</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item) => {
                    const invoiceData = extractInvoiceData(item.data)
                    const validation = validateInvoiceTotal(item.data)
                    const isExpanded = expandedRows.has(item.id)
                    const items = item.data.items || []
                    const isUpdating = updatingStatus === item.id

                    return (
                      <React.Fragment key={item.id}>
                        <TableRow>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleRowExpansion(item.id)}
                              className="p-0 h-6 w-6"
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">{invoiceData.invoiceNumber}</TableCell>
                          <TableCell>{invoiceData.vendorName}</TableCell>
                          <TableCell>{invoiceData.invoiceDate}</TableCell>
                          <TableCell>{formatCurrency(invoiceData.totalAmount)}</TableCell>
                          <TableCell>{getStatusBadge(invoiceData.status)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {validation.isValid ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                              <Badge variant={validation.isValid ? "default" : "destructive"}>
                                {validation.message}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {/* Approve/Reject buttons - only show if not already approved/rejected */}
                              {invoiceData.status !== "approved" && invoiceData.status !== "rejected" && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => updateInvoiceStatus(item.id, "approved")}
                                    disabled={isUpdating}
                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  >
                                    {isUpdating ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Check className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => updateInvoiceStatus(item.id, "rejected")}
                                    disabled={isUpdating}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    {isUpdating ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <X className="h-4 w-4" />
                                    )}
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    // Try multiple possible field names for file URL
                                    const rawFileUrl =
                                      item.data.fileUrl ||
                                      item.data.downloadURL ||
                                      item.data.url ||
                                      item.data.file_url ||
                                      item.data.storageUrl ||
                                      item.data.publicUrl ||
                                      item.data.signedUrl

                                    console.log("Raw file URL:", rawFileUrl)

                                    if (rawFileUrl) {
                                      let fileUrl = rawFileUrl

                                      // If it's a Firebase Storage gs:// URL, convert it to download URL
                                      if (rawFileUrl.startsWith("gs://")) {
                                        try {
                                          fileUrl = await getFirebaseDownloadUrl(rawFileUrl)
                                          console.log("Converted to download URL:", fileUrl)
                                        } catch (error) {
                                          toast({
                                            title: "Error loading file",
                                            description: "Failed to get download URL from Firebase Storage.",
                                            variant: "destructive",
                                          })
                                          return
                                        }
                                      }

                                      // Open file in new tab
                                      window.open(fileUrl, "_blank")
                                    } else {
                                      toast({
                                        title: "File not found",
                                        description: "No file URL found for this invoice.",
                                        variant: "destructive",
                                      })
                                    }
                                  } catch (error) {
                                    console.error("Error handling file preview:", error)
                                    toast({
                                      title: "Error",
                                      description: "Failed to open file.",
                                      variant: "destructive",
                                    })
                                  }
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteInvoice(item.id, invoiceData.invoiceNumber)}
                                disabled={isUpdating}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                {isUpdating ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                              <span className="text-xs text-muted-foreground">
                                {item.processedAt.toLocaleDateString()}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && items.length > 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="p-0">
                              <div className="bg-muted/30 p-4 border-t">
                                <div className="flex justify-between items-center mb-3">
                                  <h4 className="font-medium text-sm">Invoice Items ({items.length})</h4>
                                  <div className="text-sm text-muted-foreground">
                                    Items Total: {formatCurrency(validation.itemsTotal)} | GST:{" "}
                                    {formatCurrency(validation.gstAmount)} | Invoice Total:{" "}
                                    {formatCurrency(validation.invoiceTotal)}
                                    {!validation.isValid && (
                                      <span className="text-red-500 ml-2">
                                        (Difference: {formatCurrency(validation.difference)})
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  {items.map((invoiceItem: any, index: number) => (
                                    <div
                                      key={index}
                                      className="flex items-center justify-between p-3 bg-background rounded border"
                                    >
                                      <div className="flex-1">
                                        <p className="font-medium text-sm">{invoiceItem.description || "N/A"}</p>
                                        <p className="text-xs text-muted-foreground">
                                          Quantity: {invoiceItem.quantity || "N/A"} × Unit Price:{" "}
                                          {formatCurrency(invoiceItem.unitPrice || "N/A")}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="font-medium text-sm">
                                          {formatCurrency(invoiceItem.total || "N/A")}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-3 pt-3 border-t space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium text-sm">Items Subtotal:</span>
                                    <span className="font-bold text-lg">{formatCurrency(validation.itemsTotal)}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium text-sm">GST Amount:</span>
                                    <span className="font-bold text-lg">{formatCurrency(validation.gstAmount)}</span>
                                  </div>
                                  <div className="flex justify-between items-center border-t pt-2">
                                    <span className="font-medium text-sm">Calculated Total:</span>
                                    <span className="font-bold text-lg">
                                      {formatCurrency(validation.calculatedTotal)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium text-sm">Invoice Total:</span>
                                    <span className="font-bold text-lg">{formatCurrency(validation.invoiceTotal)}</span>
                                  </div>
                                  {!validation.isValid && (
                                    <div className="flex justify-between items-center text-red-600 border-t pt-2">
                                      <span className="font-medium text-sm">Difference:</span>
                                      <span className="font-bold text-lg">{formatCurrency(validation.difference)}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Review Actions in expanded view */}
                                {invoiceData.status !== "approved" && invoiceData.status !== "rejected" && (
                                  <div className="mt-4 pt-4 border-t flex gap-2">
                                    <Button
                                      onClick={() => updateInvoiceStatus(item.id, "approved")}
                                      disabled={isUpdating}
                                      className="bg-green-600 hover:bg-green-700"
                                    >
                                      {isUpdating ? (
                                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                                      ) : (
                                        <Check className="h-4 w-4 mr-2" />
                                      )}
                                      Approve Invoice
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      onClick={() => updateInvoiceStatus(item.id, "rejected")}
                                      disabled={isUpdating}
                                    >
                                      {isUpdating ? (
                                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                                      ) : (
                                        <X className="h-4 w-4 mr-2" />
                                      )}
                                      Reject Invoice
                                    </Button>
                                  </div>
                                )}

                                {/* Show review info if already reviewed */}
                                {(invoiceData.status === "approved" || invoiceData.status === "rejected") &&
                                  item.data.reviewedAt && (
                                    <div className="mt-4 pt-4 border-t">
                                      <p className="text-sm text-muted-foreground">
                                        {invoiceData.status === "approved" ? "Approved" : "Rejected"} by{" "}
                                        {item.data.reviewedBy || "admin"} on{" "}
                                        {item.data.reviewedAt?.toDate?.()?.toLocaleDateString() || "Unknown date"}
                                      </p>
                                    </div>
                                  )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Validation Error Dialog */}
      <AlertDialog open={!!validationError} onOpenChange={() => setValidationError(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              Image Quality Issues Detected
            </AlertDialogTitle>
            <AlertDialogDescription>
              The image "{validationError?.fileName}" has quality issues that may affect processing accuracy:
              <ul className="mt-2 space-y-1">
                {validationError?.issues.map((issue, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                    {issue}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                For best results, please retake the photo with better lighting and ensure the image is clear and in
                focus.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setValidationError(null)}>Try Again</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </div>
  )
}
