"use client"

import React from "react"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Search, CheckCircle, XCircle, Eye, ArrowLeft, Check, X, Filter } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { initializeApp } from "firebase/app"
import { getFirestore, collection, query, getDocs, limit, doc, updateDoc } from "firebase/firestore"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
const db = getFirestore(app)

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
  })
  const { toast } = useToast()
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

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

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    applyFilters(processedData, newFilters)
  }

  const clearFilters = () => {
    const clearedFilters = { status: "all", validation: "all", search: "" }
    setFilters(clearedFilters)
    applyFilters(processedData, clearedFilters)
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
          <CardDescription>Filter invoices by status, validation, or search terms</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                placeholder="Invoice number, vendor, filename..."
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <div className="flex gap-2">
                <Button variant="outline" onClick={clearFilters} className="flex-1 bg-transparent">
                  Clear Filters
                </Button>
                <Badge variant="secondary" className="px-3 py-1">
                  {stats.total} results
                </Badge>
              </div>
            </div>
          </div>

          {/* Active Filters Display */}
          {(filters.status !== "all" || filters.validation !== "all" || filters.search.trim()) && (
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
                              <Button variant="ghost" size="sm" onClick={() => setSelectedJson(item.data)}>
                                <Eye className="h-4 w-4" />
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
