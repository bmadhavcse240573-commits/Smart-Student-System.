import pypdf
import os
import sys

try:
    print('Starting script...')
    if not os.path.exists('RTP_ORIGINAL_EXACT.pdf'):
        print('Error: RTP_ORIGINAL_EXACT.pdf not found')
        sys.exit(1)
    if not os.path.exists('SMART2_PROJECT_REPORT.pdf'):
        print('Error: SMART2_PROJECT_REPORT.pdf not found')
        sys.exit(1)

    reader = pypdf.PdfReader('RTP_ORIGINAL_EXACT.pdf')
    cover_pages_count = 0
    
    print('Inspecting pages from RTP_ORIGINAL_EXACT.pdf:')
    for i in range(min(10, len(reader.pages))):
        text = reader.pages[i].extract_text()
        first_line = text.split('\n')[0].strip() if text else '[No Text]'
        print(f'Page {i+1}: {first_line[:100]}')
        
        if cover_pages_count == 0:
             if ('ABSTRACT' in text.upper() or '1.' in text):
                 cover_pages_count = i

    if cover_pages_count == 0:
        cover_pages_count = 2
    
    print(f'\nDecision: Using {cover_pages_count} cover pages.')
    
    writer = pypdf.PdfWriter()
    
    # Add cover pages
    for i in range(cover_pages_count):
        writer.add_page(reader.pages[i])
        
    # Add main report pages
    report_reader = pypdf.PdfReader('SMART2_PROJECT_REPORT.pdf')
    for page in report_reader.pages:
        writer.add_page(page)
        
    output_filename = 'SMART2_PROJECT_REPORT_MERGED.pdf'
    with open(output_filename, 'wb') as f:
        writer.write(f)
        
    # Overwrite original
    os.replace(output_filename, 'SMART2_PROJECT_REPORT.pdf')
    
    final_reader = pypdf.PdfReader('SMART2_PROJECT_REPORT.pdf')
    final_size = os.path.getsize('SMART2_PROJECT_REPORT.pdf')
    
    print(f'Cover pages added: {cover_pages_count}')
    print(f'Final page count: {len(final_reader.pages)}')
    print(f'Output file size: {final_size} bytes')
    print('Script finished successfully.')

except Exception as e:
    print(f'Error occurred: {e}')
    sys.exit(1)
