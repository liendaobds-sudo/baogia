import os

path = r'c:\xampp\htdocs\Pricing\ZeplaoPrint\frontend\src\app\pricing\quotes\_hooks\useQuoteConfigurator.spec.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the debounce test
content = content.replace("    await waitFor(() => {\n      // It should call fetch for calculation\n      expect(global.fetch).toHaveBeenCalledWith(\n        expect.stringContaining('/pricing/calculate'),\n        expect.objectContaining({ method: 'POST' })\n      );\n    });\n\n    expect(result.current.pricingResult).toEqual({\n      total: 100000,\n      price_per_item: 1000,\n      type: 'loose'\n    });", 
"""    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/pricing/calculate'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.current.pricingResult).toEqual({
        total: 100000,
        price_per_item: 1000,
        type: 'loose'
      });
    });""")

# For the handleTemplateChange, ensure we wait for the update
content = content.replace("    expect(result.current.productName).toBe('Test Template');", "    await waitFor(() => expect(result.current.productName).toBe('Test Template'));")
content = content.replace("    expect(result.current.itemWidth).toBe(100);", "    expect(result.current.itemWidth).toBe(100);")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed test logic')
