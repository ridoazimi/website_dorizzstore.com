"use client";
import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

export default function AvatarUploader({name,avatarUrl}:{name:string;avatarUrl?:string|null}) {
  const input=useRef<HTMLInputElement|null>(null);
  const [url,setUrl]=useState(avatarUrl||"");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function change(file?:File){
    if(!file)return;
    setBusy(true);setError("");
    try{
      const form=new FormData();form.set("avatar",file);
      const r=await fetch("/api/member/profile",{method:"POST",body:form});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Gagal upload foto");
      setUrl(j.avatarUrl);
      window.location.reload();
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  }
  return <div className="flex items-center gap-4"><button type="button" onClick={()=>input.current?.click()} disabled={busy} className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-blue-600 to-sky-400 text-2xl font-black text-white shadow-sm">{url?<img src={url} alt="Foto profil" className="h-full w-full object-cover"/>:name.trim().charAt(0).toUpperCase()||"M"}<span className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full bg-slate-950/75 text-white">{busy?<Loader2 size={13} className="animate-spin"/>:<Camera size={13}/>}</span></button><div><button type="button" onClick={()=>input.current?.click()} disabled={busy} className="text-sm font-bold text-blue-600">{busy?"Mengunggah...":"Ganti foto profil"}</button><p className="mt-1 text-xs text-slate-500">JPG, PNG, atau WebP. Maksimal 5 MB.</p>{error&&<p className="mt-1 text-xs text-rose-600">{error}</p>}</div><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>void change(e.target.files?.[0])}/></div>;
}
