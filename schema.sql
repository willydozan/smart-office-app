-- =====================================================================
-- SMART OFFICE BAPPEDA & LITBANG TERINTEGRASI - SUPABASE SCHEMA
-- =====================================================================

-- 1. ENUM & TYPES
CREATE TYPE user_role AS ENUM ('super_admin', 'admin_bidang', 'kepala_badan', 'pimpinan', 'tamu', 'peneliti');
CREATE TYPE status_permohonan AS ENUM ('pending', 'diverifikasi', 'diproses', 'selesai', 'ditolak');
CREATE TYPE jenis_layanan AS ENUM ('penelitian_riset', 'magang_pkl', 'konsultasi_rkpd', 'tamu_kedinasan');

-- 2. USERS & PROFILES (Linked to Supabase Auth)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON PRIMARY KEY,
    nik_nip VARCHAR(30) UNIQUE,
    nama_lengkap VARCHAR(150) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role user_role DEFAULT 'peneliti',
    bidang VARCHAR(100),
    no_hp VARCHAR(20),
    telegram_chat_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. PERMOHONAN LAYANAN PUBLIK (Riset, Magang, Konsultasi, dll)
CREATE TABLE public.permohonan_layanan_publik (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nomor_tiket VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID REFERENCES public.profiles(id),
    nama_pemohon VARCHAR(150) NOT NULL,
    instansi VARCHAR(150) NOT NULL,
    jenis_layanan jenis_layanan NOT NULL,
    judul_keperluan TEXT NOT NULL,
    tanggal_mulai DATE,
    tanggal_selesai DATE,
    dokumen_url TEXT, -- Google Drive / Supabase Storage URL
    status status_permohonan DEFAULT 'pending',
    catatan_reviewer TEXT,
    qr_code_token VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. SURAT MASUK (E-Office & Naskah Dinas)
CREATE TABLE public.surat_masuk (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nomor_surat VARCHAR(100) NOT NULL,
    asal_surat VARCHAR(150) NOT NULL,
    perihal TEXT NOT NULL,
    tanggal_surat DATE NOT NULL,
    tanggal_diterima TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    file_surat_url TEXT,
    sifat_surat VARCHAR(50) DEFAULT 'Biasa', -- Biasa, Penting, Rahasia, Segera
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. DISPOSISI SURAT
CREATE TABLE public.disposisi_surat (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    surat_masuk_id UUID REFERENCES public.surat_masuk(id) ON DELETE CASCADE,
    pemberi_disposisi UUID REFERENCES public.profiles(id),
    penerima_disposisi UUID REFERENCES public.profiles(id),
    instruksi TEXT NOT NULL,
    batas_waktu DATE,
    status_disposisi VARCHAR(50) DEFAULT 'baru', -- baru, dibaca, dikerjakan, selesai
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. BUKU TAMU DIGITAL
CREATE TABLE public.buku_tamu (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nama_tamu VARCHAR(150) NOT NULL,
    instansi_asal VARCHAR(150) NOT NULL,
    tujuan_bertemu UUID REFERENCES public.profiles(id),
    keperluan TEXT NOT NULL,
    no_hp VARCHAR(20),
    foto_tamu_url TEXT,
    check_in TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    check_out TIMESTAMP WITH TIME ZONE
);

-- 7. RLS (Row Level Security) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permohonan_layanan_publik ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surat_masuk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disposisi_surat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buku_tamu ENABLE ROW LEVEL SECURITY;

-- Policy contoh: Pemohon dapat melihat permohonannya sendiri
CREATE POLICY "Users can view own permohonan" ON public.permohonan_layanan_publik
    FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'authenticated');

CREATE POLICY "Admin full access permohonan" ON public.permohonan_layanan_publik
    FOR ALL USING (true);
