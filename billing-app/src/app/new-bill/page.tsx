'use client';

import { useState, useEffect, useRef } from 'react';
import { getCustomers } from '@/app/actions/customer';
import { getProductByBarcode } from '@/app/actions/product';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Trash2, Check, ChevronsUpDown, Barcode } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

interface ProductItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  barcode?: string;
}

export default function NewBillPage() {
  const [cashierName, setCashierName] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [items, setItems] = useState<ProductItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lastScanTime, setLastScanTime] = useState(0);
  const [open, setOpen] = useState(false);

  // For manual entry
  const [manualProduct, setManualProduct] = useState({ name: '', quantity: 1, unitPrice: 0 });

  useEffect(() => {
    async function fetchCustomers() {
      const res = await getCustomers();
      if (res.success) setCustomers(res.data || []);
    }
    fetchCustomers();
  }, []);

  // Handle barcode scanning
  const handleBarcodeScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const now = Date.now();
      
      // 2-second delay (2000ms) to prevent multiple additions from one scan
      if (now - lastScanTime < 2000) {
        console.log("Throttled scan");
        setBarcodeInput('');
        return;
      }

      const barcode = barcodeInput.trim();
      if (barcode) {
        // Real product lookup
        const res = await getProductByBarcode(barcode);
        
        if (res.success && res.data) {
          const product = res.data;
          const newItem: ProductItem = {
            id: Math.random().toString(36).substr(2, 9),
            name: product.name,
            quantity: 1,
            unitPrice: product.price,
            barcode: product.barcode,
          };
          setItems((prev) => [...prev, newItem]);
        } else {
          // If not in DB, add as generic product for now
          const newItem: ProductItem = {
            id: Math.random().toString(36).substr(2, 9),
            name: `Generic Product (${barcode})`,
            quantity: 1,
            unitPrice: 0,
            barcode: barcode,
          };
          setItems((prev) => [...prev, newItem]);
        }
        
        setLastScanTime(now);
        setBarcodeInput('');
      }
    }
  };

  const addManualProduct = () => {
    if (manualProduct.name && manualProduct.unitPrice > 0) {
      setItems((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substr(2, 9),
          ...manualProduct,
        },
      ]);
      setManualProduct({ name: '', quantity: 1, unitPrice: 0 });
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const subtotal = items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const grandTotal = subtotal;

  return (
    <div className="p-8 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left Column: Bill Info & Customer (4 cols) */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="shadow-lg border-primary/10">
          <CardHeader className="bg-primary/5">
            <CardTitle className="text-lg flex items-center gap-2">
               Bill Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="cashier">Cashier Name</Label>
              <Input
                id="cashier"
                placeholder="Enter cashier name"
                value={cashierName}
                onChange={(e) => setCashierName(e.target.value)}
                className="focus-visible:ring-primary"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Customer Selection</Label>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                  >
                    {selectedCustomer
                      ? customers.find((c) => c.id === selectedCustomer.id)?.name
                      : "Search customer..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search name or phone..." />
                    <CommandList>
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup>
                        {customers.map((customer) => (
                          <CommandItem
                            key={customer.id}
                            value={customer.name + " " + customer.phone}
                            onSelect={() => {
                              setSelectedCustomer(customer);
                              setOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCustomer?.id === customer.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {customer.name} ({customer.phone})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {selectedCustomer && (
              <div className="mt-4 p-4 bg-muted/50 rounded-xl border border-primary/5 text-sm space-y-1 animate-in fade-in slide-in-from-top-1">
                <p className="font-bold text-primary">{selectedCustomer.name}</p>
                <p className="flex items-center gap-2 text-muted-foreground">{selectedCustomer.phone}</p>
                {selectedCustomer.email && <p className="text-muted-foreground">{selectedCustomer.email}</p>}
                <p className="text-xs text-muted-foreground pt-1 border-t mt-1">{selectedCustomer.address}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg border-primary/10 overflow-hidden">
          <CardHeader className="bg-primary/5">
            <CardTitle className="text-lg flex items-center gap-2">
              <Barcode className="w-5 h-5 text-primary" /> Barcode Scanner
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="relative">
              <Input
                placeholder="Focus here to scan..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeScan}
                autoFocus
                className="bg-primary/5 border-primary/20 h-12 text-lg font-mono focus-visible:ring-primary"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Ready to scan" />
              </div>
            </div>
            <p className="text-[10px] mt-3 text-muted-foreground flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-primary" />
              1 scan = 1 product. 2-second safety delay enabled.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-primary text-primary-foreground shadow-xl border-none">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm opacity-90">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="h-px bg-primary-foreground/20" />
              <div className="flex justify-between items-center text-2xl font-black">
                <span>GRAND TOTAL</span>
                <span>${grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Products (8 cols) */}
      <div className="lg:col-span-8 space-y-6">
        <Card className="shadow-sm border-dashed">
          <CardHeader>
            <CardTitle className="text-base font-medium">Add Product Manually</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Product Name</Label>
              <Input
                placeholder="Search or type product..."
                value={manualProduct.name}
                onChange={(e) => setManualProduct({ ...manualProduct, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Qty</Label>
              <Input
                type="number"
                value={manualProduct.quantity}
                onChange={(e) => setManualProduct({ ...manualProduct, quantity: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Unit Price</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={manualProduct.unitPrice}
                  onChange={(e) => setManualProduct({ ...manualProduct, unitPrice: parseFloat(e.target.value) || 0 })}
                />
                <Button onClick={addManualProduct} className="shrink-0">Add</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-xl tracking-tight">Current Bill Items</h3>
            <span className="text-sm bg-muted px-2 py-1 rounded-md font-mono">{items.length} Items</span>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-2xl bg-muted/30 text-muted-foreground">
                <Barcode className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-medium">The bill is currently empty</p>
                <p className="text-sm">Scan a barcode or use manual entry above</p>
              </div>
            )}
            
            {items.map((item) => (
              <div
                key={item.id}
                className="group flex items-center justify-between p-5 bg-card border rounded-2xl shadow-sm hover:shadow-md hover:border-primary/20 transition-all animate-in zoom-in-95 duration-200"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-lg group-hover:text-primary transition-colors">{item.name}</h4>
                    {item.barcode && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
                        {item.barcode}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Quantity:</span>
                      <span className="font-semibold text-foreground bg-muted/50 px-2 py-0.5 rounded">{item.quantity}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Unit Price:</span>
                      <span className="font-semibold text-foreground">${item.unitPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right flex items-center gap-8">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-tighter">Total Price</span>
                    <span className="font-black text-2xl tracking-tighter">${(item.quantity * item.unitPrice).toFixed(2)}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => removeItem(item.id)} 
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full h-10 w-10 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
