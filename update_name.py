import glob, re

files = glob.glob('/sdcard/downloads/darkpath/*.html') + glob.glob('/sdcard/downloads/darkpath/*.js')
if not files:
    files = glob.glob('*.html') + glob.glob('*.js')

for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace any previous variations with Grid Lock
    content = re.sub(r'THE DARK PAGE', 'Grid Lock', content, flags=re.IGNORECASE)
    content = re.sub(r'GRIDLOCK', 'Grid Lock', content, flags=re.IGNORECASE)
    content = re.sub(r'GRID LOCL', 'Grid Lock', content, flags=re.IGNORECASE)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Title updated to Grid Lock across all files!")
