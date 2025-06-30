"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Search,
  Download,
  Eye,
  Filter,
  Calendar,
  DollarSign,
  FileText,
  ArrowLeft,
  Trash2,
  AlertTriangle,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { initializeApp } from "firebase/app"
import { getFirestore, collection, getDocs, query, orderBy, deleteDoc, doc } from "firebase/firestore"
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
const db = getFirestore(app)

interface ProcessedInvoice {
  id: string
  fileName: string
  processedAt: Date
  status: "completed" | "processing" | "error"
  extractedData: {
    invoiceNumber?: string
    date?: string
    vendor?: string
    total?: number
    currency?: string
    items?: Array<{
      description: string
      quantity: number
      unitPrice: number
      total: number
    }>
  }
  originalImageUrl?: string
  confidence?: number
}

export default function ProcessedInvoicesPage() {
  const [invoices, setInvoices] = useState<ProcessedInvoice[]>([])
  const [filteredInvoices, setFilteredInvoices] = useState<ProcessedInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<string>("all")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<ProcessedInvoice | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchProcessedInvoices()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [invoices, searchTerm, statusFilter, dateFilter])

  const fetchProcessedInvoices = async () => {
    try {
      setLoading(true)
      const q = query(collection(db, "processed_invoices"), orderBy("processedAt", "desc"))
      const querySnapshot = await getDocs(q)

      const invoicesData: ProcessedInvoice[] = []
      querySnapshot.forEach((doc) => {
        const data = doc.data()
        invoicesData.push({
          id: doc.id,
          fileName: data.fileName || "Unknown",
          processedAt: data.processedAt?.toDate() || new Date(),
          status: data.status || "processing",
          extractedData: data.extractedData || {},
          originalImageUrl: data.originalImageUrl,
          confidence: data.confidence || 0,
        })
      })

      setInvoices(invoicesData)
    } catch (error) {
      console.error("Error fetching processed invoices:", error)
      toast({
        title: "Error",
        description: "Failed to fetch processed invoices",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const deleteInvoice = async (invoice: ProcessedInvoice) => {
    try {
      await deleteDoc(doc(db, "processed_invoices", invoice.id))

      // Update local state
      setInvoices((prev) => prev.filter((inv) => inv.id !== invoice.id))

      toast({
        title: "Invoice deleted",
        description: `${invoice.fileName} has been permanently deleted.`,
      })
    } catch (error) {
      console.error("Error deleting invoice:", error)
      toast({
        title: "Delete failed",
        description: "There was an error deleting the invoice.",
        variant: "destructive",
      })
    }
  }

  const handleDeleteClick = (invoice: ProcessedInvoice) => {
    setInvoiceToDelete(invoice)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (invoiceToDelete) {
      await deleteInvoice(invoiceToDelete)
      setDeleteDialogOpen(false)
      setInvoiceToDelete(null)
    }
  }

  const applyFilters = () => {
    let filtered = [...invoices]

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (invoice) =>
          invoice.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          invoice.extractedData.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          invoice.extractedData.vendor?.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((invoice) => invoice.status === statusFilter)
    }

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date()
      const filterDate = new Date()

      switch (dateFilter) {
        case "today":
          filterDate.setHours(0, 0, 0, 0)
          filtered = filtered.filter((invoice) => invoice.processedAt >= filterDate)
          break
        case "week":
          filterDate.setDate(now.getDate() - 7)
          filtered = filtered.filter((invoice) => invoice.processedAt >= filterDate)
          break
        case "month":
          filterDate.setMonth(now.getMonth() - 1)
          filtered = filtered.filter((invoice) => invoice.processedAt >= filterDate)
          break
      }
    }

    setFilteredInvoices(filtered)
  }

  const exportToCSV = () => {
    const csvContent = [
      ["File Name", "Invoice Number", "Date", "Vendor", "Total", "Currency", "Status", "Processed At"].join(","),
      ...filteredInvoices.map((invoice) =>
        [
          invoice.fileName,
          invoice.extractedData.invoiceNumber || "",
          invoice.extractedData.date || "",
          invoice.extractedData.vendor || "",
          invoice.extractedData.total || "",
          invoice.extractedData.currency || "",
          invoice.status,
          invoice.processedAt.toLocaleDateString(),
        ].join(","),
      ),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `processed_invoices_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const formatCurrency = (amount: number, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>
      case "processing":
        return <Badge className="bg-yellow-100 text-yellow-800">Processing</Badge>
      case "error":
        return <Badge className="bg-red-100 text-red-800">Error</Badge>
      default:
        return <Badge variant="secondary">Unknown</Badge>
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading processed invoices...</p>
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
            <h1 className="text-3xl font-bold">Processed Invoices</h1>
            <p className="text-muted-foreground">
              {filteredInvoices.length} of {invoices.length} invoices
            </p>
          </div>
        </div>
        <Button onClick={exportToCSV} disabled={filteredInvoices.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Invoices</p>
                <p className="text-2xl font-bold">{invoices.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(
                    invoices
                      .filter((inv) => inv.extractedData.total)
                      .reduce((sum, inv) => sum + (inv.extractedData.total || 0), 0),
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">
                  {
                    invoices.filter((inv) => {
                      const monthAgo = new Date()
                      monthAgo.setMonth(monthAgo.getMonth() - 1)
                      return inv.processedAt >= monthAgo
                    }).length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{invoices.filter((inv) => inv.status === "completed").length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by filename, invoice number, or vendor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Last Week</SelectItem>
                <SelectItem value="month">Last Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Data</CardTitle>
          <CardDescription>Extracted information from processed invoices</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-4" />
              <p>No processed invoices found</p>
              <p className="text-sm">Try adjusting your filters or upload some invoices</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Processed</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.fileName}</TableCell>
                      <TableCell>{invoice.extractedData.invoiceNumber || "N/A"}</TableCell>
                      <TableCell>{invoice.extractedData.date || "N/A"}</TableCell>
                      <TableCell>{invoice.extractedData.vendor || "N/A"}</TableCell>
                      <TableCell>
                        {invoice.extractedData.total
                          ? formatCurrency(invoice.extractedData.total, invoice.extractedData.currency)
                          : "N/A"}
                      </TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell>{invoice.processedAt.toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {invoice.originalImageUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(invoice.originalImageUrl, "_blank")}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(invoice)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Invoice
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{invoiceToDelete?.fileName}</strong>?
              <br />
              <br />
              This action cannot be undone. The invoice data will be permanently removed from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setInvoiceToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Delete Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
