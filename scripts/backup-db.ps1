<#
    Выгрузка базы данных в папку backups/.

    Зачем скриптом, а не руками: бэкап, который нужно вспомнить сделать,
    не делается. Этот запускается одной командой и сам подписывает файл датой.

    Использование:
        $env:SUPABASE_DB_URL = "postgresql://postgres:пароль@db.проект.supabase.co:5432/postgres"
        ./scripts/backup-db.ps1

    Строка подключения берётся в панели Supabase: Project Settings → Database →
    Connection string. В файл её не вписываем и в репозиторий не коммитим.
#>

$ErrorActionPreference = "Stop"

$connection = $env:SUPABASE_DB_URL
if ([string]::IsNullOrWhiteSpace($connection)) {
    Write-Error "Не задана переменная SUPABASE_DB_URL. Как её получить — в комментарии внутри этого файла."
    exit 1
}

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    Write-Error "Не найдена программа pg_dump. Она входит в состав PostgreSQL: установите его или добавьте в PATH."
    exit 1
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $projectRoot "backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$target = Join-Path $backupDir "neuroizium_$stamp.sql"

Write-Host "Выгружаю базу в $target"
pg_dump --dbname=$connection --no-owner --no-privileges --file=$target

if ($LASTEXITCODE -ne 0) {
    Write-Error "Выгрузка не удалась. Файл может быть неполным: $target"
    exit $LASTEXITCODE
}

$sizeMb = [math]::Round((Get-Item $target).Length / 1MB, 2)
Write-Host "Готово. Размер: $sizeMb МБ"
Write-Host "Скопируйте файл туда, где он переживёт этот компьютер: облако или внешний диск."

# Оставляем 10 последних выгрузок, остальные удаляем: иначе папка растёт
# бесконечно, а старые копии всё равно никому не нужны.
Get-ChildItem -Path $backupDir -Filter "neuroizium_*.sql" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 10 |
    Remove-Item -Force
