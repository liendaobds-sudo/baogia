import os

path = r'c:\xampp\htdocs\Pricing\ZeplaoPrint\frontend\src\app\pricing\quotes\_hooks\useQuoteConfigurator.spec.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the order
# First change /quote-templates to exact match or include ?action=list
content = content.replace("if (url.includes('/quote-templates')) {", "if (url.includes('/quote-templates') && !url.includes('/quote-templates/defaults')) {")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed fetch mock conflict')
