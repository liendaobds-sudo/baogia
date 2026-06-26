import os

path = r'c:\xampp\htdocs\Pricing\ZeplaoPrint\frontend\src\app\pricing\quotes\_hooks\useQuoteConfigurator.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add console.log inside handleTemplateChange
content = content.replace("        const code = e.target.value;", "        const code = e.target.value;\n        console.log('handleTemplateChange called', code, token);")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Added console log to hook')
