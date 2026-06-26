import os

path = r'c:\xampp\htdocs\Pricing\ZeplaoPrint\frontend\src\app\pricing\quotes\_hooks\useQuoteConfigurator.spec.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("jest.mock('@/lib/api'", "jest.mock('../../../../lib/api'")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated test mock paths')
