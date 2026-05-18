$file = "c:\Users\Smart zone\Desktop\MY NEW MANAGMENT  SYSTEM -\public\app.js"
$content = [System.IO.File]::ReadAllText($file)

# Fix colspan from 3 to 4
$content = $content.Replace('colspan="3" style="text-align:center;padding:20px;color:var(--text-muted)"', 'colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)"')

# Replace old barcode row with new one that has per-product copies
$old = @'
            tb.innerHTML = filtered.map(p => `
                <tr onclick="addToPrintQueue('${p.name.replace(/'/g, "\\'")}', '${p.barcode||''}', ${p.price})" style="cursor:pointer">
                    <td><strong>${p.name}</strong></td>
                    <td><code style="background:var(--bg-soft);padding:2px 6px;border-radius:4px;font-size:12px">${p.barcode || '<span style="color:var(--danger)">No Barcode</span>'}</code></td>
                    <td style="text-align:right">
                        <button class="btn btn-sm btn-outline">
                            <i class='bx bx-plus'></i> Add
                        </button>
                    </td>
                </tr>`).join('');
'@

$new = @'
            tb.innerHTML = filtered.map(p => `
                <tr style="cursor:pointer">
                    <td><strong>${p.name}</strong></td>
                    <td><code style="background:var(--bg-soft);padding:2px 6px;border-radius:4px;font-size:12px">${p.barcode || '<span style="color:var(--danger)">No Barcode</span>'}</code></td>
                    <td><input type="number" class="form-control" data-bc-id="${p.id}" value="${document.getElementById('barcode-copies').value || 10}" min="1" style="width:60px;padding:4px;font-size:12px" onclick="event.stopPropagation()"></td>
                    <td style="text-align:right">
                        <button class="btn btn-sm btn-outline" onclick="addToPrintQueue('${p.name.replace(/'/g, "\\'")}', '${p.barcode||''}', ${p.price}, this.closest('tr').querySelector('[data-bc-id]').value)">
                            <i class='bx bx-plus'></i> Add
                        </button>
                    </td>
                </tr>`).join('');
'@

$content = $content.Replace($old, $new)

[System.IO.File]::WriteAllText($file, $content)
Write-Host "Done - barcode fix applied"
