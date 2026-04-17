export const Cache = {

    recetasByCode: new Map(),

    indexRecetas(recetas) {

        this.recetasByCode.clear();

        recetas.forEach(r => {

            if (r.codigo_pos)
                this.recetasByCode.set(r.codigo_pos, r);

        });

    }

};
