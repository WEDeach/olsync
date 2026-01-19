export function read7BitString(buf: Buffer) {
    let length=0;
    let shift=0;
    let currentOffset=0;

    while(shift<32) {
        const byte=buf.readUInt8(currentOffset++);
        length|=(byte&0x7F)<<shift;

        if((byte&0x80)===0) {
            break;
        }

        shift+=7;
    }

    const value=buf.toString('utf8',currentOffset,currentOffset+length);

    return {
        value,
        length: currentOffset,
        stringLength: length,
        newOffset: currentOffset+length
    };
}

export function write7BitString(str: string): Buffer {

    const strBuf=Buffer.from(str,'utf8');
    let len=strBuf.length;
    let buf_len=0;
    do {
        len>>=7;
        buf_len++;
    } while(len>0);
    console.log(`write7BitString: ${str}, len: ${len}, buf_len: ${buf_len}`);
    const buf=Buffer.alloc(buf_len+strBuf.length);
    let lenOffset=0;
    len=strBuf.length;
    do {
        let byte=len&0x7F;
        len>>=7;
        if(len>0) byte|=0x80;
        buf[lenOffset++]=byte;
    } while(len>0);
    strBuf.copy(buf,lenOffset);
    return buf;
}

export function readNullableString(buf: Buffer) {
    const firstByte=buf.readUInt8();
    if(firstByte===0) {
        return {
            value: null,
            newOffset: 1
        };
    }
    let result=read7BitString(buf.subarray(1));
    result.newOffset+=1;
    return result;
}

export function writeNullableString(str: string|null): Buffer {
    let buf: Buffer;
    if(str==null) {
        buf=Buffer.alloc(1);
        buf[0]=0x00;
        return buf;
    } else {
        const bits=write7BitString(str);
        buf=Buffer.alloc(bits.length+1);
        buf[0]=0x0B;
        bits.copy(buf,1);
        return buf
    }
}

export function readByteArray(buf: Buffer) {
    const len=buf.readInt32LE();
    const dataOffset=4;

    return {
        value: len>0? buf.subarray(dataOffset,dataOffset+len):
            len<0? null:
                Buffer.alloc(0),
        newOffset: len>0? dataOffset+len:dataOffset
    };
}