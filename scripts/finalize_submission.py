"""
软著材料一键生成 → C:\Users\D0gSXG\Desktop\qiwen-second-admit

使用方法（Windows 本机执行）:
    cd C:\Users\D0gSXG\Documents\GitHub\Polaris_agent
    python scripts\finalize_submission.py
"""
import os, shutil, subprocess, sys

POLARIS_DIR = r'C:\Users\D0gSXG\Documents\GitHub\Polaris_agent'
OUT_DIR     = r'C:\Users\D0gSXG\Desktop\qiwen-second-admit'
QIWEN_SRC   = r'C:\Users\D0gSXG\Documents\GitHub\qiwen_v2.0.0'
PHOTO_DIR   = r'C:\Users\D0gSXG\Desktop\bitwool\qiwen\qiwen_text\photo'

os.makedirs(OUT_DIR, exist_ok=True)

def step(msg):
    print(f'\n═══ {msg} ═══')

# ═══════════════════════════════════════════════════
# 1. 生成技术文档（含截图）
# ═══════════════════════════════════════════════════
step('1/4 生成技术文档（含截图）')
subprocess.run([sys.executable, os.path.join(POLARIS_DIR, 'scripts', 'gen_qiwen_doc.py')], check=True)
shutil.copy2(os.path.join(POLARIS_DIR, 'qiwen_jishu_wendang_v2.docx'),
             os.path.join(OUT_DIR, '启文_技术文档_v2.0.0.docx'))

# ═══════════════════════════════════════════════════
# 2. 生成技术交底书
# ═══════════════════════════════════════════════════
step('2/4 生成技术交底书')
subprocess.run([sys.executable, os.path.join(POLARIS_DIR, 'scripts', 'gen_jiaodishu.py')], check=True)
shutil.copy2(os.path.join(POLARIS_DIR, '启文_技术交底书_v2.0.0.docx'),
             os.path.join(OUT_DIR, '启文_技术交底书_v2.0.0.docx'))

# ═══════════════════════════════════════════════════
# 3. 生成 + 合并鉴别材料
# ═══════════════════════════════════════════════════
step('3/4 生成 + 合并程序鉴别材料')
subprocess.run([sys.executable, os.path.join(POLARIS_DIR, 'scripts', 'gen_jianbie.py')], check=True)
front = os.path.join(POLARIS_DIR, '启文_程序鉴别材料_前30页.docx')
back  = os.path.join(POLARIS_DIR, '启文_程序鉴别材料_后30页.docx')

if os.path.exists(front) and os.path.exists(back):
    from docx import Document
    fdoc = Document(front)
    bdoc = Document(back)
    # copy body elements manually
    body = fdoc.element.body
    for child in bdoc.element.body:
        body.append(child)
    merged = os.path.join(OUT_DIR, '启文_程序鉴别材料.docx')
    fdoc.save(merged)
    print(f'✓ 鉴别材料合并: {merged}')
else:
    print('⚠ 鉴别材料生成不完整')

# ═══════════════════════════════════════════════════
# 4. 全部转 PDF
# ═══════════════════════════════════════════════════
step('4/4 转换 PDF（需要 LibreOffice）')
for fname in sorted(os.listdir(OUT_DIR)):
    if not fname.endswith('.docx'):
        continue
    path = os.path.join(OUT_DIR, fname)
    print(f'  转换 {fname}...')
    try:
        subprocess.run([
            'soffice', '--headless', '--convert-to', 'pdf',
            '--outdir', OUT_DIR, path,
        ], timeout=180, check=True)
        pdf = path.replace('.docx', '.pdf')
        if os.path.exists(pdf):
            print(f'  ✓ {os.path.basename(pdf)}')
    except FileNotFoundError:
        print(f'  ✗ 未安装 LibreOffice，请先下载: https://www.libreoffice.org/download/')
        break
    except Exception as e:
        print(f'  ✗ 失败: {e}')

# ═══════════════════════════════════════════════════
# 汇总
# ═══════════════════════════════════════════════════
print(f'\n══════════════════════════════════════')
print(f'全部完成！输出目录: {OUT_DIR}')
for f in sorted(os.listdir(OUT_DIR)):
    path = os.path.join(OUT_DIR, f)
    size = os.path.getsize(path)
    unit = 'MB' if size > 1024*1024 else 'KB'
    val  = size/1024/1024 if size > 1024*1024 else size/1024
    print(f'  {f}  ({val:.1f} {unit})')
