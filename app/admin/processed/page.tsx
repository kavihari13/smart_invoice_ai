"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft,
  Eye,
  Download,
  Search,
  Filter,
  X,
  CalendarIcon,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
} from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { initializeApp } from "firebase/app"
import { getFirestore, collection, getDocs, query, orderBy } from "firebase/firestore"
import { getStorage, ref, getDownloadURL } from "firebase/storage"

// Firebase configuration
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

interface ProcessedInvoice {
  id: string
  data: any
  processedAt: Date
  status: "pending_review" | "approved" | "rejected"
  validation: "valid" | "invalid" | "pending"
}

interface FilterState {
  status: string
  validation: string
  search: string
  dateFrom: Date | undefined
  dateTo: Date | undefined
}

export default function ProcessedInvoicesPage() {
  const [invoices, setInvoices] = useState<ProcessedInvoice[]>([])
  const [filteredInvoices, setFilteredInvoices] = useState<ProcessedInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showJsonViewer, setShowJsonViewer] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<ProcessedInvoice | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    status: "all",
    validation: "all",
    search: "",
    dateFrom: undefined,
    dateTo: undefined,
  })
  const { toast } = useToast()

  // Load processed invoices from Firestore
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        const invoicesRef = collection(db, "processed_invoices")
        const q = query(invoicesRef, orderBy("processedAt", "desc"))
        const querySnapshot = await getDocs(q)

        const loadedInvoices: ProcessedInvoice[] = []
        querySnapshot.forEach((doc) => {
          const data = doc.data()
          loadedInvoices.push({
            id: doc.id,
            data: data,
            processedAt: data.processedAt?.toDate() || new Date(),
            status: data.status || "pending_review",
            validation: data.validation || "pending",
          })
        })

        setInvoices(loadedInvoices)
        setFilteredInvoices(loadedInvoices)
      } catch (error) {
        console.error("Error loading invoices:", error)
        toast({
          title: "Error loading data",
          description: "Failed to load processed invoices from database.",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    loadInvoices()
  }, [toast])

  // Apply filters
  useEffect(() => {
    let filtered = [...invoices]

    // Status filter
    if (filters.status !== "all") {
      filtered = filtered.filter((invoice) => invoice.status === filters.status)
    }

    // Validation filter
    if (filters.validation !== "all") {
      filtered = filtered.filter((invoice) => invoice.validation === filters.validation)
    }

    // Search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase()
      filtered = filtered.filter((invoice) => {
        const invoiceNumber = invoice.data.invoiceNumber?.toLowerCase() || ""
        const vendorName = invoice.data.vendorName?.toLowerCase() || ""
        const fileName = invoice.data.fileName?.toLowerCase() || ""
        return invoiceNumber.includes(searchTerm) || vendorName.includes(searchTerm) || fileName.includes(searchTerm)
      })
    }

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      filtered = filtered.filter((invoice) => {
        const invoiceDate = invoice.processedAt

        if (filters.dateFrom && filters.dateTo) {
          return invoiceDate >= filters.dateFrom && invoiceDate <= filters.dateTo
        } else if (filters.dateFrom) {
          return invoiceDate >= filters.dateFrom
        } else if (filters.dateTo) {
          return invoiceDate <= filters.dateTo
        }

        return true
      })
    }

    setFilteredInvoices(filtered)
  }, [invoices, filters])

  const handleViewFile = async (invoice: ProcessedInvoice) => {
    try {
      // Look for file URL in the data
      const fileUrl =
        invoice.data.fileUrl ||
        invoice.data.downloadURL ||
        invoice.data.url ||
        invoice.data.file_url ||
        invoice.data.storageUrl ||
        invoice.data.publicUrl ||
        invoice.data.signedUrl

      if (!fileUrl) {
        toast({
          title: "File not found",
          description: "No file URL found in the invoice data.",
          variant: "destructive",
        })
        return
      }

      let downloadUrl = fileUrl

      // Convert Firebase Storage URL if needed
      if (fileUrl.startsWith("gs://")) {
        try {
          const gsPath = fileUrl.replace("gs://smartinvoice-ai.firebasestorage.app/", "")
          const storageRef = ref(storage, gsPath)
          downloadUrl = await getDownloadURL(storageRef)
        } catch (error) {
          console.error("Error converting Firebase Storage URL:", error)
          toast({
            title: "Error accessing file",
            description: "Failed to generate download URL for the file.",
            variant: "destructive",
          })
          return
        }
      }

      // Open file in new tab
      window.open(downloadUrl, "_blank")
    } catch (error) {
      console.error("Error viewing file:", error)
      toast({
        title: "Error opening file",
        description: "Failed to open the file. Please try again.",
        variant: "destructive",
      })
    }
  }

  const clearFilter = (filterType: keyof FilterState) => {
    setFilters((prev) => ({
      ...prev,
      [filterType]:
        filterType === "search" ? "" : filterType === "dateFrom" || filterType === "dateTo" ? undefined : "all",
    }))
  }

  const clearAllFilters = () => {
    setFilters({
      status: "all",
      validation: "all",
      search: "",
      dateFrom: undefined,
      dateTo: undefined,
    })
  }

  const setDatePreset = (preset: string) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    switch (preset) {
      case "today":
        setFilters((prev) => ({ ...prev, dateFrom: today, dateTo: today }))
        break
      case "yesterday":
        setFilters((prev) => ({ ...prev, dateFrom: yesterday, dateTo: yesterday }))
        break
      case "last7days":
        const last7Days = new Date(today)
        last7Days.setDate(last7Days.getDate() - 7)
        setFilters((prev) => ({ ...prev, dateFrom: last7Days, dateTo: today }))
        break
      case "last30days":
        const last30Days = new Date(today)
        last30Days.setDate(last30Days.getDate() - 30)
        setFilters((prev) => ({ ...prev, dateFrom: last30Days, dateTo: today }))
        break
      case "thismonth":
        const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        setFilters((prev) => ({ ...prev, dateFrom: thisMonthStart, dateTo: today }))
        break
      case "lastmonth":
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
        setFilters((prev) => ({ ...prev, dateFrom: lastMonthStart, dateTo: lastMonthEnd }))
        break
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "rejected":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "pending_review":
        return <Clock className="h-4 w-4 text-yellow-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const getValidationIcon = (validation: string) => {
    switch (validation) {
      case "valid":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "invalid":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  // Calculate statistics based on filtered data
  const stats = {
    total: filteredInvoices.length,
    approved: filteredInvoices.filter((inv) => inv.status === "approved").length,
    rejected: filteredInvoices.filter((inv) => inv.status === "rejected").length,
    pending: filteredInvoices.filter((inv) => inv.status === "pending_review").length,
    valid: filteredInvoices.filter((inv) => inv.validation === "valid").length,
    invalid: filteredInvoices.filter((inv) => inv.validation === "invalid").length,
  }

  // Count active filters
  const activeFiltersCount = [
    filters.status !== "all",
    filters.validation !== "all",
    filters.search !== "",
    filters.dateFrom !== undefined,
    filters.dateTo !== undefined,
  ].filter(Boolean).length

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading processed invoices...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Upload
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Processed Invoice Data</h1>
            <p className="text-muted-foreground">Review and manage AI-processed invoice data</p>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total Invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <p className="text-xs text-muted-foreground">Rejected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.valid}</div>
            <p className="text-xs text-muted-foreground">Valid</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{stats.invalid}</div>
            <p className="text-xs text-muted-foreground">Invalid</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
              {activeFiltersCount > 0 && <Badge variant="secondary">{activeFiltersCount} active</Badge>}
            </CardTitle>
            {activeFiltersCount > 0 && (
              <Button variant="outline" size="sm" onClick={clearAllFilters}>
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Main Filters Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Status Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Validation Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Validation</label>
              <Select
                value={filters.validation}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, validation: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All validations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Validations</SelectItem>
                  <SelectItem value="valid">Valid</SelectItem>
                  <SelectItem value="invalid">Invalid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Invoice #, vendor, filename..."
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Date Range Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "flex-1 justify-start text-left font-normal",
                        !filters.dateFrom && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateFrom ? format(filters.dateFrom, "MMM dd") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.dateFrom}
                      onSelect={(date) => setFilters((prev) => ({ ...prev, dateFrom: date }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "flex-1 justify-start text-left font-normal",
                        !filters.dateTo && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateTo ? format(filters.dateTo, "MMM dd") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.dateTo}
                      onSelect={(date) => setFilters((prev) => ({ ...prev, dateTo: date }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Date Presets */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium text-muted-foreground">Quick dates:</span>
            {[
              { label: "Today", value: "today" },
              { label: "Yesterday", value: "yesterday" },
              { label: "Last 7 Days", value: "last7days" },
              { label: "Last 30 Days", value: "last30days" },
              { label: "This Month", value: "thismonth" },
              { label: "Last Month", value: "lastmonth" },
            ].map((preset) => (
              <Button key={preset.value} variant="outline" size="sm" onClick={() => setDatePreset(preset.value)}>
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Active Filters Display */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <span className="text-sm font-medium text-muted-foreground">Active filters:</span>
              {filters.status !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  Status: {filters.status.replace("_", " ")}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => clearFilter("status")} />
                </Badge>
              )}
              {filters.validation !== "all" && (
                <Badge variant="secondary" className="gap-1">
                  Validation: {filters.validation}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => clearFilter("validation")} />
                </Badge>
              )}
              {filters.search && (
                <Badge variant="secondary" className="gap-1">
                  Search: "{filters.search}"
                  <X className="h-3 w-3 cursor-pointer" onClick={() => clearFilter("search")} />
                </Badge>
              )}
              {(filters.dateFrom || filters.dateTo) && (
                <Badge variant="secondary" className="gap-1">
                  Date: {filters.dateFrom ? format(filters.dateFrom, "MMM dd") : "Start"} -{" "}
                  {filters.dateTo ? format(filters.dateTo, "MMM dd") : "End"}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setFilters((prev) => ({ ...prev, dateFrom: undefined, dateTo: undefined }))}
                  />
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices List */}
      <Card>
        <CardHeader>
          <CardTitle>Processed Invoices ({filteredInvoices.length})</CardTitle>
          <CardDescription>
            {filteredInvoices.length === invoices.length
              ? `Showing all ${invoices.length} processed invoices`
              : `Showing ${filteredInvoices.length} of ${invoices.length} processed invoices`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No invoices found</h3>
              <p className="text-muted-foreground mb-4">
                {activeFiltersCount > 0
                  ? "No invoices match your current filters. Try adjusting your search criteria."
                  : "No processed invoices available yet. Upload some files to get started."}
              </p>
              {activeFiltersCount > 0 && (
                <Button variant="outline" onClick={clearAllFilters}>
                  Clear All Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredInvoices.map((invoice) => (
                <div key={invoice.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">
                          {invoice.data.invoiceNumber || invoice.data.fileName || `Invoice ${invoice.id.slice(0, 8)}`}
                        </h3>
                        <div className="flex items-center gap-1">
                          {getStatusIcon(invoice.status)}
                          <Badge
                            variant={
                              invoice.status === "approved"
                                ? "default"
                                : invoice.status === "rejected"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {invoice.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          {getValidationIcon(invoice.validation)}
                          <Badge
                            variant={
                              invoice.validation === "valid"
                                ? "default"
                                : invoice.validation === "invalid"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {invoice.validation}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">Vendor:</span> {invoice.data.vendorName || "N/A"}
                        </div>
                        <div>
                          <span className="font-medium">Amount:</span> {invoice.data.totalAmount || "N/A"}
                        </div>
                        <div>
                          <span className="font-medium">Date:</span> {invoice.data.invoiceDate || "N/A"}
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Processed: {invoice.processedAt.toLocaleDateString()} at{" "}
                        {invoice.processedAt.toLocaleTimeString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <Button variant="outline" size="sm" onClick={() => handleViewFile(invoice)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View File
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedInvoice(invoice)
                          setShowJsonViewer(true)
                        }}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        View Data
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* JSON Viewer Modal */}
      {showJsonViewer && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                Invoice Data - {selectedInvoice.data.invoiceNumber || selectedInvoice.id}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowJsonViewer(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(80vh-80px)]">
              <pre className="text-sm bg-muted p-4 rounded-lg overflow-auto">
                {JSON.stringify(selectedInvoice.data, null, 2)}
              </pre>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(selectedInvoice.data, null, 2))
                  toast({ title: "Copied to clipboard" })
                }}
              >
                Copy JSON
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(selectedInvoice.data, null, 2)], { type: "application/json" })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement("a")
                  a.href = url
                  a.download = `invoice-${selectedInvoice.id}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Download JSON
              </Button>
              <Button onClick={() => setShowJsonViewer(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
