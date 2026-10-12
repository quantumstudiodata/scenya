-- Series de ejemplo. Los videos apuntan a un clip de muestra público; reemplázalos por los tuyos.
insert into public.series (slug, title, synopsis, genre, is_featured) values
  ('el-heredero-oculto', 'El Heredero Oculto', 'Un mesero humillado descubre que es el único heredero de un imperio.', 'Romance', true),
  ('casada-con-mi-enemigo', 'Casada con mi Enemigo', 'Un contrato de matrimonio entre dos familias rivales.', 'Drama', false),
  ('reina-de-la-venganza', 'Reina de la Venganza', 'Traicionada el día de su boda, vuelve para cobrar cada deuda.', 'Venganza', false),
  ('la-otra-esposa', 'La Otra Esposa', 'Una desconocida aparece con un anillo idéntico al suyo.', 'Suspenso', false),
  ('luna-de-sangre', 'Luna de Sangre', 'La hija del alfa se enamora del heredero del clan enemigo.', 'Fantasía', false),
  ('mi-ceo-millonario', 'Mi CEO Millonario', 'Su nueva jefa es la mujer que él dejó plantada hace diez años.', 'CEO', false);

insert into public.episodes (series_id, number, title, duration_seconds)
select s.id, n, 'Episodio ' || n, 90 from public.series s, generate_series(1, 30) n;

insert into public.episode_videos (episode_id, video_url)
select e.id, 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
from public.episodes e;
