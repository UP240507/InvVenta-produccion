-- Función RPC para descontar stock de forma atómica desde el frontend.
-- Uso esperado desde Supabase JS:
-- supabase.rpc('decrementar_stock', {
--   p_producto_id,
--   p_delta,
--   p_referencia,
--   p_usuario,
--   p_tipo
-- });

create or replace function public.decrementar_stock(
  p_producto_id bigint,
  p_delta numeric,
  p_referencia text default null,
  p_usuario text default null,
  p_tipo text default 'Salida POS'
)
returns table (
  producto_id bigint,
  stock_anterior numeric,
  stock_nuevo numeric,
  cantidad_descontada numeric
)
language plpgsql
as $$
declare
  v_stock_actual numeric;
  v_stock_nuevo numeric;
  v_delta numeric;
begin
  -- Validar parámetros básicos.
  if p_producto_id is null then
    raise exception 'El producto_id es obligatorio';
  end if;

  if p_delta is null then
    raise exception 'La cantidad a descontar es obligatoria';
  end if;

  if p_delta <= 0 then
    raise exception 'La cantidad a descontar debe ser mayor que cero';
  end if;

  -- Redondeo defensivo para evitar ruido de punto flotante acumulado.
  v_delta := round(p_delta::numeric, 4);

  if v_delta <= 0 then
    raise exception 'La cantidad a descontar debe ser mayor que cero';
  end if;

  -- Bloquear la fila del producto para evitar race conditions entre ventas concurrentes.
  select p.stock
    into v_stock_actual
  from public.productos p
  where p.id = p_producto_id
  for update;

  -- Validar existencia del producto.
  if not found then
    raise exception 'No existe el producto con id %', p_producto_id;
  end if;

  v_stock_actual := round(coalesce(v_stock_actual, 0)::numeric, 4);

  -- Validar stock suficiente antes de actualizar.
  if v_stock_actual < v_delta then
    raise exception 'Stock insuficiente para el producto %. Disponible: %, requerido: %',
      p_producto_id,
      v_stock_actual,
      v_delta;
  end if;

  -- Calcular nuevo stock con el mismo criterio de redondeo.
  v_stock_nuevo := round(v_stock_actual - v_delta, 4);

  -- Salvaguarda adicional para no dejar valores negativos por decimales residuales.
  if v_stock_nuevo < 0 then
    raise exception 'El cálculo de stock resultó negativo para el producto %', p_producto_id;
  end if;

  -- Actualizar stock ya con la fila bloqueada.
  update public.productos
  set stock = v_stock_nuevo
  where id = p_producto_id;

  -- Registrar el movimiento de inventario.
  insert into public.movimientos (
    producto_id,
    tipo,
    cantidad,
    referencia,
    usuario,
    stock_anterior,
    stock_nuevo,
    fecha
  ) values (
    p_producto_id,
    coalesce(nullif(trim(p_tipo), ''), 'Salida POS'),
    v_delta,
    p_referencia,
    p_usuario,
    v_stock_actual,
    v_stock_nuevo,
    now()
  );

  -- Devolver datos útiles para auditoría y para el cliente RPC.
  return query
  select
    p_producto_id as producto_id,
    v_stock_actual as stock_anterior,
    v_stock_nuevo as stock_nuevo,
    v_delta as cantidad_descontada;
end;
$$;

comment on function public.decrementar_stock(bigint, numeric, text, text, text)
is 'Descuenta stock de un producto de forma atómica usando SELECT ... FOR UPDATE, valida existencia/stock suficiente, registra el movimiento y devuelve el antes/después.';