#!/usr/bin/env python3
"""Import the complete official StoryWeave source archive into a cloned Git repository.

Requires Python 3, Git, and authenticated GitHub access on your own computer.
Never embeds or transmits any credentials; never force-pushes.
"""
from __future__ import annotations
import argparse, fnmatch, pathlib, re, subprocess, sys, zipfile

MUST_HAVE = {
    "android/app/src/main/java/com/storyweave/studio/MainActivity.java",
    "android/app/src/main/java/com/storyweave/studio/NativeTabletActivity.java",
    "android/app/src/main/java/com/storyweave/studio/NativeStoryRepository.java",
    "android/app/src/main/AndroidManifest.xml",
    "android/app/build.gradle", "web/app.js",
    "web/vendor/azgaar/LICENSE", "web/vendor/leaflet/LICENSE",
}
EXCLUDE_PARTS = {".git",".idea",".gradle","node_modules","build","__pycache__"}
EXCLUDE_NAMES = ("*.jks","*.keystore","*.p12","*.p8","*.pem","*.key","*.token","*.apk","*.aab","*.log","google-services.json","credentials.json","secrets.properties","id_rsa*",".env",".env.*")
SECRET_PATTERNS = (
    rb"-----BEGIN (?:RSA|OPENSSH|EC|DSA|PRIVATE) (?:[A-Z ]* )?KEY-----",
    rb"\b(?:sk-proj-|sk-[A-Za-z0-9]{24,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{25,}|AKIA[0-9A-Z]{16})",
)

def git(repo, *args):
    r = subprocess.run(["git", *args], cwd=repo, text=True, capture_output=True)
    if r.returncode:
        raise RuntimeError(f"git {' '.join(args)} failed:\n{r.stderr}")
    return r.stdout.strip()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_zip", type=pathlib.Path)
    parser.add_argument("--repo", type=pathlib.Path, required=True)
    parser.add_argument("--publish", action="store_true", help="Commit and push after review; default is dry run")
    args = parser.parse_args()
    repo=args.repo.resolve()
    if not (repo/".git").exists(): parser.error("--repo must be a cloned Git repository")
    if git(repo,"branch","--show-current")!="main": parser.error("Use the main branch")
    if git(repo,"status","--porcelain"): parser.error("Git working tree is not clean")
    with zipfile.ZipFile(args.source_zip) as z:
        entries=[e for e in z.infolist() if not e.is_dir()]
        if MUST_HAVE-set(e.filename for e in entries):
            raise ValueError("Source ZIP lacks expected Android, Web, or license files")
        allowed=[]
        for e in entries:
            name=e.filename
            parts=pathlib.PurePosixPath(name)
            if parts.is_absolute() or ".." in parts.parts or "\\" in name:
                raise ValueError("Unsafe archive path: "+name)
            if any(p in EXCLUDE_PARTS for p in parts.parts) or any(fnmatch.fnmatch(parts.name,pat) for pat in EXCLUDE_NAMES):
                print("SKIP:",name)
                continue
            if e.file_size>100*1024*1024: raise ValueError("File exceeds 100 MB: "+name)
            raw=z.read(e)
            if any(re.search(pattern,raw) for pattern in SECRET_PATTERNS):
                raise ValueError("Possible credential: "+name+"; review before publishing")
            allowed.append((name,raw))
    print(f"Verified {len(entries)} source files, {len(allowed)} publish candidates")
    if not args.publish:
        print("Dry run only. Add --publish when ready.")
        return 0
    for name,raw in allowed:
        path=repo/name
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_bytes(raw)
    (repo/"docs"/"UPLOAD_STATUS.md").write_text("# Source upload\n\nv1.9.19 archive re-imported and pushed; Android build and device verification are still pending.\nThis file is a placeholder written by the importer; see docs/GITHUB_IMPORT.md and restore the maintained status text after re-import.\n",encoding="utf-8")
    git(repo,"add","--all")
    if git(repo,"diff","--cached","--name-only"):
        git(repo,"commit","-m","feat: import complete StoryWeave v1.9.19 source")
        git(repo,"push","origin","main")
    print("Finished. Verify GitHub repository and build separately.")
    return 0

if __name__=="__main__":
    try: sys.exit(main())
    except (RuntimeError,ValueError,zipfile.BadZipFile) as err:
        print(f"ERROR: {err}",file=sys.stderr)
        sys.exit(2)
