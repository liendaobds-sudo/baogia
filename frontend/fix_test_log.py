import os

path = r'c:\xampp\htdocs\Pricing\ZeplaoPrint\frontend\src\app\pricing\quotes\_hooks\useQuoteConfigurator.spec.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add a console log inside the fetch mock
content = content.replace("if (url.includes('/quote-templates/defaults')) {", "if (url.includes('/quote-templates/defaults')) {\n        console.log('FETCH CALLED FOR DEFAULTS', url);")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Added console log')
