"use client"

import React from "react"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Search, CheckCircle, XCircle, Eye, ArrowLeft } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { initializeApp } from "firebase/app"
import { getFirestore, collection, query, getDocs, limit } from "firebase/firestore"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronDown, ChevronRight } from "lucide-react"
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

export default function ProcessedDataPage() {
  const [processedData, setProcessedData] = useState<ProcessedData[]>([])
  const [fetchingData, setFetchingData] = useState(false)
  const [selectedJson, setSelectedJson] = useState<any>(null)
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

    if (items.length === 0) {
      return {
        isValid: false,
        message: "No items found",
        itemsTotal: 0,
        invoiceTotal: Number.parseFloat(totalAmount.toString()) || 0,
        difference: 0,
      }
    }

    // Calculate sum of all item totals
    const itemsTotal = items.reduce((sum: number, item: any) => {
      const itemTotal = Number.parseFloat(item.total || item.amount || "0")
      return sum + itemTotal
    }, 0)

    const invoiceTotal = Number.parseFloat(totalAmount.toString()) || 0
    const difference = Math.abs(itemsTotal - invoiceTotal)

    // Consider valid if difference is less than 0.01 (to handle floating point precision)
    const isValid = difference < 0.01

    return {
      isValid,
      message: isValid ? "Valid" : `Mismatch: ₹${difference.toFixed(2)}`,
      itemsTotal,
      invoiceTotal,
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

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{processedData.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Valid Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {processedData.filter((item) => validateInvoiceTotal(item.data).isValid).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Invalid Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {processedData.filter((item) => !validateInvoiceTotal(item.data).isValid).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(
                processedData.reduce((sum, item) => {
                  const invoiceData = extractInvoiceData(item.data)
                  const amount = Number.parseFloat(invoiceData.totalAmount.toString()) || 0
                  return sum + amount
                }, 0),
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Processed Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Processing Results</CardTitle>
          <CardDescription>Detailed view of all processed invoices with validation</CardDescription>
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
                  {processedData.map((item) => {
                    const invoiceData = extractInvoiceData(item.data)
                    const validation = validateInvoiceTotal(item.data)
                    const isExpanded = expandedRows.has(item.id)
                    const items = item.data.items || []

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
                                    Items Total: {formatCurrency(validation.itemsTotal)} | Invoice Total:{" "}
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
                                <div className="mt-3 pt-3 border-t flex justify-between items-center">
                                  <span className="font-medium text-sm">Calculated Total:</span>
                                  <span className="font-bold text-lg">{formatCurrency(validation.itemsTotal)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="font-medium text-sm">Invoice Total:</span>
                                  <span className="font-bold text-lg">{formatCurrency(validation.invoiceTotal)}</span>
                                </div>
                                {!validation.isValid && (
                                  <div className="flex justify-between items-center text-red-600">
                                    <span className="font-medium text-sm">Difference:</span>
                                    <span className="font-bold text-lg">{formatCurrency(validation.difference)}</span>
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
