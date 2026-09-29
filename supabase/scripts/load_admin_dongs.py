# supabase/scripts/load_admin_dongs.py
"""행정동 경계 GeoJSON(4326, vuski/admdongkor 형식) -> admin_dongs upsert SQL.

  python supabase/scripts/load_admin_dongs.py HangJeongDong.geojson supabase/.admin_dongs.sql
로컬:  Get-Content supabase/.admin_dongs.sql -Raw -Encoding UTF8 | docker exec -i supabase_db_sanchaeknyang psql -U postgres -d postgres
배포:  psql "<DB 연결 문자열>" -f supabase/.admin_dongs.sql
재실행 안전(code 기준 upsert). 경계가 바뀐 해에는 새 파일로 다시 돌리면 된다.
"""
import json
import sys


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def to_sql(fc):
    out = ["begin;", "set local search_path = public, extensions;"]
    for f in fc["features"]:
        g, p = f.get("geometry"), f.get("properties") or {}
        if not g:
            continue
        name = (p.get("adm_nm") or "").split(" ")[-1]
        # 원본 도형이 가끔 자기교차 — makevalid 후 면만 남겨 MultiPolygon으로.
        geom = (f"st_multi(st_collectionextract(st_makevalid(st_transform("
                f"st_setsrid(st_geomfromgeojson({q(json.dumps(g))}), 4326), 5179)), 3))")
        out.append(
            "insert into public.admin_dongs (code, name, sido, sigungu, geom) values "
            f"({q(p.get('adm_cd2'))}, {q(name)}, {q(p.get('sidonm'))}, {q(p.get('sggnm'))}, {geom}) "
            "on conflict (code) do update set name = excluded.name, sido = excluded.sido, "
            "sigungu = excluded.sigungu, geom = excluded.geom;"
        )
    out.append("commit;")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as fh:
        sql = to_sql(json.load(fh))
    with open(dst, "w", encoding="utf-8") as fh:
        fh.write(sql)
    print("wrote", dst, sql.count("insert into"), "dongs")
