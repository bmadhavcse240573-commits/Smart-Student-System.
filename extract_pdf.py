import pdfplumber
path = r'c:\Users\B MAdhav\Desktop\RTP DOCUMENT SAMPLE TEMPLATE.docx.pdf'
try:
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                print(text)
except Exception as e:
    print(f'Error: {e}')
