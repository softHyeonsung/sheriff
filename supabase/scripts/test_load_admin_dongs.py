# supabase/scripts/test_load_admin_dongs.py — run: python supabase/scripts/test_load_admin_dongs.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from load_admin_dongs import to_sql  # noqa: E402

square = {"type": "Polygon", "coordinates": [[[126.9, 37.5], [127.0, 37.5], [127.0, 37.6], [126.9, 37.5]]]}
fc = {
    "type": "FeatureCollection",
    "features": [
        {"type": "Feature", "geometry": square,
         "properties": {"adm_cd2": "1111053000", "adm_nm": "서울특별시 종로구 사직동", "sidonm": "서울특별시", "sggnm": "종로구"}},
        {"type": "Feature", "geometry": square,
         "properties": {"adm_cd2": "9", "adm_nm": "어느도 어느군 o'dong", "sidonm": "어느도", "sggnm": "어느군"}},
        {"type": "Feature", "geometry": None, "properties": {"adm_cd2": "0", "adm_nm": "빈 도형"}},
    ],
}
sql = to_sql(fc)
assert sql.startswith("begin;") and sql.rstrip().endswith("commit;"), sql[:80]
assert "'1111053000', '사직동', '서울특별시', '종로구'" in sql
assert "'o''dong'" in sql, "작은따옴표는 두 번 써서 이스케이프"
assert "빈 도형" not in sql, "도형 없는 feature는 건너뜀"
assert sql.count("insert into") == 2
assert "delete from public.admin_dongs;" in sql and "on conflict" not in sql, "경계 교체: 없어진 동이 남지 않게 통째로 바꾼다"
assert "st_transform(" in sql and ", 5179)" in sql
print("ok")
