import os

path = r'c:\xampp\htdocs\Pricing\ZeplaoPrint\frontend\src\app\pricing\quotes\_hooks\useQuoteConfigurator.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("try {\n            const res = await fetch", "try {\n            console.log('about to fetch', API_URL);\n            const res = await fetch")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Added about to fetch log')
