package io.littlelanguages.data

interface Union2<A, B> {
    fun isA(): Boolean
    fun isB(): Boolean

    fun a(): A
    fun b(): B
}

data class Union2a<A, B>(private val a: A) : Union2<A, B> {
    override fun isA(): Boolean = true
    override fun isB(): Boolean = false

    override fun a(): A = a

    override fun b(): B {
        throw IllegalArgumentException("b is not set")
    }
}

data class Union2b<A, B>(private val b: B) : Union2<A, B> {
    override fun isA(): Boolean = false
    override fun isB(): Boolean = true

    override fun a(): A {
        throw IllegalArgumentException("a is not set")
    }

    override fun b(): B = b
}

interface Union3<A, B, C> {
    fun isA(): Boolean
    fun isB(): Boolean
    fun isC(): Boolean

    fun a(): A
    fun b(): B
    fun c(): C
}

data class Union3a<A, B, C>(private val a: A) : Union3<A, B, C> {
    override fun isA(): Boolean = true
    override fun isB(): Boolean = false
    override fun isC(): Boolean = false

    override fun a(): A = a

    override fun b(): B {
        throw IllegalArgumentException("b is not set")
    }

    override fun c(): C {
        throw IllegalArgumentException("c is not set")
    }
}

data class Union3b<A, B, C>(private val b: B) : Union3<A, B, C> {
    override fun isA(): Boolean = false
    override fun isB(): Boolean = true
    override fun isC(): Boolean = false

    override fun a(): A {
        throw IllegalArgumentException("a is not set")
    }

    override fun b(): B = b

    override fun c(): C {
        throw IllegalArgumentException("c is not set")
    }
}

data class Union3c<A, B, C>(private val c: C) : Union3<A, B, C> {
    override fun isA(): Boolean = false
    override fun isB(): Boolean = false
    override fun isC(): Boolean = true

    override fun a(): A {
        throw IllegalArgumentException("a is not set")
    }

    override fun b(): B {
        throw IllegalArgumentException("b is not set")
    }

    override fun c(): C = c
}
