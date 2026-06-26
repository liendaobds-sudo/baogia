import os

path = r'c:\xampp\htdocs\Pricing\ZeplaoPrint\frontend\src\app\pricing\quotes\_hooks\useQuoteConfigurator.spec.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("global.fetch = jest.fn((url: string) => {", "global.fetch = jest.fn((url: string, options: any) => {\n      console.log('TEST FETCH', url);")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Added TEST FETCH log')
